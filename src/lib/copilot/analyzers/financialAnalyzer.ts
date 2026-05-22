import type { CopilotDataset, FinancialInsight } from "../types";

const DAY = 24 * 60 * 60 * 1000;

export function analyzeFinancial(ds: CopilotDataset): FinancialInsight[] {
  const out: FinancialInsight[] = [];
  const now = ds.generatedAt;

  const income = ds.financialRecords.filter((r) => r.type === "income");
  const expense = ds.financialRecords.filter((r) => r.type === "expense");
  const totalIncome = income.reduce((a, r) => a + (r.amount || 0), 0);
  const totalExpense = expense.reduce((a, r) => a + (r.amount || 0), 0);
  const margin = totalIncome - totalExpense;

  if (totalIncome > 0 && margin < 0) {
    out.push({
      id: "fin_margin_pressure",
      topic: "margin_pressure",
      amount: margin,
      severity: "critical",
      title: "Margem operacional negativa",
      detail: `Despesas (€${totalExpense.toFixed(0)}) superam receitas (€${totalIncome.toFixed(0)}) em €${Math.abs(margin).toFixed(0)} na janela.`,
      reasoning: ["Soma direta de income vs expense no período.", "Indica pressão operacional sustentada."],
      evidence: [
        { kind: "metric", ref: "fin.income_total", value: Number(totalIncome.toFixed(2)) },
        { kind: "metric", ref: "fin.expense_total", value: Number(totalExpense.toFixed(2)) },
      ],
    });
  } else if (totalIncome > 0 && margin / totalIncome < 0.1) {
    out.push({
      id: "fin_margin_thin",
      topic: "margin_pressure",
      amount: margin,
      severity: "warn",
      title: "Margem operacional fina",
      detail: `Margem atual €${margin.toFixed(0)} (${((margin / totalIncome) * 100).toFixed(1)}%).`,
      reasoning: ["Margem abaixo de 10% — pouca folga para imprevistos."],
      evidence: [{ kind: "metric", ref: "fin.margin_pct", value: Number(((margin / totalIncome) * 100).toFixed(1)) }],
    });
  }

  /* Concentration: top client share of payment_orders */
  const byClient = new Map<string, number>();
  for (const p of ds.paymentOrders) {
    if (!p.client || !p.amount) continue;
    byClient.set(p.client, (byClient.get(p.client) ?? 0) + p.amount);
  }
  const totalPO = Array.from(byClient.values()).reduce((a, b) => a + b, 0);
  if (totalPO > 0) {
    const sorted = [...byClient.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    if (top && top[1] / totalPO > 0.45) {
      out.push({
        id: "fin_concentration",
        topic: "concentration_risk",
        amount: top[1],
        severity: "warn",
        title: `Concentração de receita em "${top[0]}"`,
        detail: `${top[0]} representa ${((top[1] / totalPO) * 100).toFixed(0)}% das OP (€${top[1].toFixed(0)}).`,
        reasoning: ["Mais de 45% da receita num único cliente eleva risco de churn."],
        evidence: [{ kind: "metric", ref: "fin.top_client_pct", value: Number(((top[1] / totalPO) * 100).toFixed(0)) }],
      });
    }
  }

  /* Unpaid aging — POs unpaid older than 30 days */
  const unpaidAging = ds.paymentOrders.filter(
    (p) => !p.paidAt && now - p.createdAt > 30 * DAY,
  );
  if (unpaidAging.length) {
    const sum = unpaidAging.reduce((a, p) => a + (p.amount ?? 0), 0);
    out.push({
      id: "fin_aging",
      topic: "unpaid_aging",
      amount: sum,
      severity: unpaidAging.length >= 5 ? "warn" : "watch",
      title: "Ordens de pagamento em atraso",
      detail: `${unpaidAging.length} OP não pagas há >30 dias (€${sum.toFixed(0)}).`,
      reasoning: ["Fluxo de caixa comprometido — priorizar cobrança."],
      evidence: [{ kind: "metric", ref: "fin.unpaid_aging_count", value: unpaidAging.length }],
    });
  }

  /* Fuel overspend vs revenue */
  const fuelCost = ds.fuelLogs.reduce((a, f) => a + (f.totalCost || 0), 0);
  if (totalIncome > 0 && fuelCost / totalIncome > 0.2) {
    out.push({
      id: "fin_fuel",
      topic: "fuel_overspend",
      amount: fuelCost,
      severity: "warn",
      title: "Combustível pesando na receita",
      detail: `Custos de combustível €${fuelCost.toFixed(0)} = ${((fuelCost / totalIncome) * 100).toFixed(0)}% da receita.`,
      reasoning: ["Combustível representando mais de 20% da receita é atípico."],
      evidence: [{ kind: "metric", ref: "fuel.share_of_revenue", value: Number(((fuelCost / totalIncome) * 100).toFixed(0)) }],
    });
  }

  return out;
}
