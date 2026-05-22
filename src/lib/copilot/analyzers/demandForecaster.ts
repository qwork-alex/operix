import type { CopilotDataset, CopilotForecast } from "../types";

const DAY = 24 * 60 * 60 * 1000;

function bucketByDay(times: number[], windowDays: number, now: number): number[] {
  const buckets = new Array(windowDays).fill(0);
  for (const t of times) {
    const idx = windowDays - 1 - Math.floor((now - t) / DAY);
    if (idx >= 0 && idx < windowDays) buckets[idx] += 1;
  }
  return buckets;
}

/**
 * Linear regression slope over a series (least-squares).
 */
function slope(series: number[]): number {
  const n = series.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = series.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (series[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function forecastDemand(ds: CopilotDataset): CopilotForecast[] {
  const out: CopilotForecast[] = [];
  const now = ds.generatedAt;
  const w = ds.windowDays;

  /* ----- service orders / day ----- */
  const soSeries = bucketByDay(
    ds.serviceOrders.map((o) => o.createdAt),
    w, now,
  );
  const soDaily = soSeries.reduce((a, b) => a + b, 0) / Math.max(1, w);
  const soSlope = slope(soSeries);
  const soProjected7 = Math.max(0, Math.round((soDaily + soSlope * 3.5) * 7));
  const soBaseline7 = Math.max(0, Math.round(soDaily * 7));
  out.push({
    id: "fc_so_7d",
    metric: "service_orders",
    horizon: "next_7d",
    baseline: soBaseline7,
    projected: soProjected7,
    delta: soProjected7 - soBaseline7,
    deltaPct: soBaseline7 === 0 ? 0 : (soProjected7 - soBaseline7) / soBaseline7,
    confidence: Math.min(0.9, 0.4 + Math.min(0.4, w / 30) + (soSeries.length > 7 ? 0.1 : 0)),
    reasoning: [
      `Média de ${soDaily.toFixed(1)} OS/dia nos últimos ${w} dias.`,
      `Tendência ${soSlope > 0 ? "crescente" : soSlope < 0 ? "decrescente" : "estável"} (slope=${soSlope.toFixed(2)}).`,
      "Projeção linear, sem ajustes sazonais.",
    ],
    evidence: [
      { kind: "metric", ref: "so.daily_avg", value: Number(soDaily.toFixed(2)) },
      { kind: "metric", ref: "so.slope", value: Number(soSlope.toFixed(3)) },
    ],
  });

  /* ----- revenue projection (income financial_records) ----- */
  const incomes = ds.financialRecords.filter((r) => r.type === "income");
  const incomeSum = incomes.reduce((a, r) => a + (r.amount || 0), 0);
  const dailyIncome = incomeSum / Math.max(1, w);
  const incomeSeries = (() => {
    const buckets = new Array(w).fill(0);
    for (const r of incomes) {
      const idx = w - 1 - Math.floor((now - r.createdAt) / DAY);
      if (idx >= 0 && idx < w) buckets[idx] += r.amount || 0;
    }
    return buckets;
  })();
  const incomeSlope = slope(incomeSeries);
  const proj30 = Math.max(0, dailyIncome * 30 + incomeSlope * 15 * 30);
  out.push({
    id: "fc_revenue_30d",
    metric: "revenue",
    horizon: "next_30d",
    baseline: Math.round(dailyIncome * 30),
    projected: Math.round(proj30),
    delta: Math.round(proj30 - dailyIncome * 30),
    deltaPct: dailyIncome === 0 ? 0 : (proj30 - dailyIncome * 30) / (dailyIncome * 30),
    confidence: incomes.length >= 10 ? 0.7 : incomes.length >= 3 ? 0.5 : 0.3,
    reasoning: [
      `Média de receita diária €${dailyIncome.toFixed(2)} na janela.`,
      `Tendência ${incomeSlope > 0 ? "positiva" : incomeSlope < 0 ? "negativa" : "neutra"}.`,
      "Não inclui sazonalidade nem pipeline de propostas.",
    ],
    evidence: [
      { kind: "metric", ref: "income.daily_avg", value: Number(dailyIncome.toFixed(2)) },
      { kind: "metric", ref: "income.records", value: incomes.length },
    ],
  });

  /* ----- fuel cost ----- */
  if (ds.fuelLogs.length) {
    const fuelSum = ds.fuelLogs.reduce((a, f) => a + (f.totalCost || 0), 0);
    const dailyFuel = fuelSum / Math.max(1, w);
    const proj = dailyFuel * 30;
    out.push({
      id: "fc_fuel_30d",
      metric: "fuel_cost",
      horizon: "next_30d",
      baseline: Math.round(dailyFuel * 30),
      projected: Math.round(proj),
      delta: 0,
      deltaPct: 0,
      confidence: ds.fuelLogs.length >= 10 ? 0.7 : 0.45,
      reasoning: [
        `Média €${dailyFuel.toFixed(2)}/dia em abastecimentos (${ds.fuelLogs.length} registos).`,
        "Extrapolação direta — sem ajuste por previsão de OS.",
      ],
      evidence: [{ kind: "metric", ref: "fuel.daily_avg", value: Number(dailyFuel.toFixed(2)) }],
    });
  }

  return out;
}
