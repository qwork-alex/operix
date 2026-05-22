import type {
  CopilotDataset,
  CopilotForecast,
  CopilotSeverity,
  DelayPrediction,
  DispatchSuggestion,
  FinancialInsight,
  ProductivityInsight,
  StrategicRecommendation,
} from "../types";

/**
 * Aggregates the outputs of the other analyzers into a small, ranked set of
 * actionable strategic recommendations.
 */
export function recommend(
  ds: CopilotDataset,
  forecasts: CopilotForecast[],
  delays: DelayPrediction[],
  dispatch: DispatchSuggestion[],
  productivity: ProductivityInsight[],
  financial: FinancialInsight[],
): StrategicRecommendation[] {
  const out: StrategicRecommendation[] = [];

  /* 1. Demand surge → capacity */
  const demand = forecasts.find((f) => f.metric === "service_orders");
  if (demand && demand.deltaPct > 0.25 && demand.projected > 0) {
    out.push({
      id: "rec_capacity_up",
      title: "Reforçar capacidade operacional",
      detail: `Projeção +${(demand.deltaPct * 100).toFixed(0)}% de OS nos próximos 7 dias.`,
      category: "demand",
      severity: pickSeverity(demand.deltaPct, [0.5, 0.35, 0.25]),
      expectedImpact: "Evitar SLA breaches e overload de técnicos.",
      steps: [
        "Confirmar disponibilidade dos técnicos para a próxima semana.",
        "Reativar técnicos ociosos / acionar parceiros se aplicável.",
        "Bloquear novas folgas até estabilização.",
      ],
      evidence: demand.evidence,
    });
  } else if (demand && demand.deltaPct < -0.25) {
    out.push({
      id: "rec_capacity_down",
      title: "Reduzir custo operacional",
      detail: `Projeção ${(demand.deltaPct * 100).toFixed(0)}% de OS — janela para revisão de custos.`,
      category: "strategic",
      severity: "watch",
      steps: [
        "Auditar despesas fixas e renegociar contratos.",
        "Avaliar redistribuição de equipa.",
        "Reforçar campanhas comerciais.",
      ],
      evidence: demand.evidence,
    });
  }

  /* 2. Delay queue → dispatch action */
  const criticalDelays = delays.filter((d) => d.probability >= 0.6);
  if (criticalDelays.length >= 3) {
    out.push({
      id: "rec_delay_intervene",
      title: "Intervir nas OS em risco de SLA",
      detail: `${criticalDelays.length} ordens com probabilidade ≥60% de atraso.`,
      category: "delay",
      severity: criticalDelays.length >= 8 ? "critical" : "warn",
      steps: [
        "Abrir a lista de delays no copiloto.",
        "Reatribuir ou priorizar manualmente cada OS de risco.",
        "Notificar o cliente proativamente quando aplicável.",
      ],
      evidence: criticalDelays.slice(0, 3).flatMap((d) => d.evidence),
    });
  }

  /* 3. Smart dispatch */
  const goodDispatch = dispatch.filter((d) => d.score >= 0.6);
  if (goodDispatch.length >= 3) {
    out.push({
      id: "rec_dispatch_auto",
      title: "Aplicar dispatch sugerido",
      detail: `${goodDispatch.length} OS com candidato técnico de alta confiança.`,
      category: "dispatch",
      severity: "watch",
      expectedImpact: "Reduz tempo de atribuição e melhora afinidade cliente/técnico.",
      steps: [
        "Rever sugestões com score ≥ 0.6.",
        "Aplicar atribuição uma a uma após validação.",
      ],
      evidence: goodDispatch.slice(0, 3).flatMap((d) => d.evidence),
    });
  }

  /* 4. Productivity dips */
  const dips = productivity.filter((p) => p.severity === "warn");
  if (dips.length) {
    out.push({
      id: "rec_productivity_dip",
      title: "Investigar queda de produtividade",
      detail: `${dips.length} agente(s)/veículo(s) com sinal de queda.`,
      category: "productivity",
      severity: "warn",
      steps: [
        "Abrir o painel de produtividade.",
        "Verificar afastamentos, sobrecarga ou problemas técnicos.",
        "Reequilibrar a carga se necessário.",
      ],
      evidence: dips.slice(0, 3).flatMap((p) => p.evidence),
    });
  }

  /* 5. Financial */
  const finCritical = financial.filter((f) => f.severity === "critical");
  for (const f of finCritical) {
    out.push({
      id: `rec_fin_${f.id}`,
      title: f.title,
      detail: f.detail,
      category: "financial",
      severity: "critical",
      steps: [
        "Abrir o painel financeiro e confirmar números.",
        "Identificar lançamentos que mais contribuem para o desvio.",
        "Definir plano de mitigação imediato.",
      ],
      evidence: f.evidence,
    });
  }
  const finWarn = financial.filter((f) => f.severity === "warn");
  for (const f of finWarn) {
    out.push({
      id: `rec_fin_${f.id}`,
      title: f.title,
      detail: f.detail,
      category: "financial",
      severity: "warn",
      steps: ["Revisar contexto.", "Definir ação corretiva nas próximas duas semanas."],
      evidence: f.evidence,
    });
  }

  /* 6. Automation failures */
  const autoFails = ds.automationRuns.filter((r) => r.status === "error").length;
  if (autoFails >= 5) {
    out.push({
      id: "rec_automation_repair",
      title: "Reparar automações instáveis",
      detail: `${autoFails} execuções de automação em erro na janela.`,
      category: "automation",
      severity: autoFails >= 15 ? "critical" : "warn",
      steps: [
        "Abrir histórico de automações.",
        "Identificar regras com taxa de erro alta e pausar.",
        "Corrigir condições e reativar.",
      ],
      evidence: [{ kind: "metric", ref: "automation.error_count", value: autoFails }],
    });
  }

  out.sort((a, b) => sevWeight(b.severity) - sevWeight(a.severity));
  return out.slice(0, 12);
}

function pickSeverity(value: number, thresholds: [number, number, number]): CopilotSeverity {
  if (value >= thresholds[0]) return "critical";
  if (value >= thresholds[1]) return "warn";
  if (value >= thresholds[2]) return "watch";
  return "info";
}
function sevWeight(s: CopilotSeverity) {
  return s === "critical" ? 3 : s === "warn" ? 2 : s === "watch" ? 1 : 0;
}
