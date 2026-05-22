import type { CopilotDataset, DelayPrediction } from "../types";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/**
 * Predicts which open orders are likely to slip vs their expected_at,
 * using historical completion lead-time as the empirical baseline.
 */
export function predictDelays(ds: CopilotDataset): DelayPrediction[] {
  const now = ds.generatedAt;
  const out: DelayPrediction[] = [];

  /* ---- Service orders ---- */
  const closedSO = ds.serviceOrders.filter(
    (o) => o.completedAt && o.createdAt && o.completedAt > o.createdAt,
  );
  const soLeadAvgMs =
    closedSO.length === 0
      ? 3 * DAY
      : closedSO.reduce((a, o) => a + ((o.completedAt as number) - o.createdAt), 0) / closedSO.length;

  const openSO = ds.serviceOrders.filter(
    (o) => !o.completedAt && !["cancelled", "cancelado", "void"].includes(o.status?.toLowerCase?.() ?? ""),
  );
  for (const o of openSO) {
    const ageMs = now - o.createdAt;
    const predictedAt = o.createdAt + soLeadAvgMs;
    const expectedAt = o.expectedAt ?? null;
    let slipMin = 0;
    let probability = 0;

    if (expectedAt) {
      slipMin = Math.max(0, Math.round((predictedAt - expectedAt) / 60000));
      const overdueRatio = ageMs / Math.max(HOUR, expectedAt - o.createdAt);
      probability = Math.min(0.99, Math.max(0, overdueRatio - 0.6));
    } else {
      // No SLA recorded — flag only if older than 1.5x the lead average
      const ratio = ageMs / soLeadAvgMs;
      probability = ratio > 1.5 ? Math.min(0.9, (ratio - 1) * 0.5) : 0;
      slipMin = ratio > 1 ? Math.round((ageMs - soLeadAvgMs) / 60000) : 0;
    }

    if (probability < 0.2 && slipMin <= 0) continue;
    out.push({
      id: `delay_so_${o.id}`,
      orderId: o.id,
      orderRef: o.ref ?? null,
      module: "service_orders",
      expectedAt,
      predictedAt,
      slipMinutes: slipMin,
      probability,
      reasoning: [
        `Idade atual: ${Math.round(ageMs / HOUR)}h.`,
        `Lead-time histórico médio: ${(soLeadAvgMs / HOUR).toFixed(1)}h (${closedSO.length} amostras).`,
        expectedAt
          ? `SLA expira em ${Math.round((expectedAt - now) / HOUR)}h.`
          : "Sem SLA registado — comparação puramente histórica.",
      ],
      evidence: [
        { kind: "record", ref: `service_orders:${o.id}`, label: o.ref ?? o.id },
        { kind: "metric", ref: "so.lead_time_h_avg", value: Number((soLeadAvgMs / HOUR).toFixed(1)) },
      ],
    });
  }

  /* ---- Production orders (same heuristic, lighter weight) ---- */
  const closedPO = ds.productionOrders.filter((p) => p.completedAt);
  const poLeadAvg =
    closedPO.length === 0
      ? 5 * DAY
      : closedPO.reduce((a, p) => a + ((p.completedAt as number) - p.createdAt), 0) / closedPO.length;

  const openPO = ds.productionOrders.filter((p) => !p.completedAt);
  for (const p of openPO) {
    const ageMs = now - p.createdAt;
    const ratio = ageMs / poLeadAvg;
    if (ratio < 1.2) continue;
    out.push({
      id: `delay_po_${p.id}`,
      orderId: p.id,
      orderRef: p.ref ?? null,
      module: "production_orders",
      expectedAt: p.expectedAt ?? null,
      predictedAt: p.createdAt + poLeadAvg,
      slipMinutes: Math.round((ageMs - poLeadAvg) / 60000),
      probability: Math.min(0.95, (ratio - 1) * 0.45),
      reasoning: [
        `Produção aberta há ${(ageMs / DAY).toFixed(1)} dias.`,
        `Lead-time histórico médio: ${(poLeadAvg / DAY).toFixed(1)} dias.`,
      ],
      evidence: [
        { kind: "record", ref: `production_orders:${p.id}`, label: p.ref ?? p.id },
      ],
    });
  }

  out.sort((a, b) => b.probability - a.probability);
  return out.slice(0, 20);
}
