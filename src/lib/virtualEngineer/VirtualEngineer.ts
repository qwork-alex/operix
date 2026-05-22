/**
 * VirtualEngineer — operational copilot core.
 *
 * Consumes the deterministic substrate produced by:
 *   - AgentRuntime          (classified signals + rolling context)
 *   - RuntimeHealthMonitor  (websocket / ingest / providers / edge)
 *   - OperationalEventBus   (unified raw event stream)
 *
 * Produces:
 *   - Root-cause hypotheses (with confidence + evidence pointers)
 *   - Fix proposals (categorised, severity-tagged, actionable)
 *   - Incident reports (timeline + narrative, ready to copy)
 *   - A live EngineerDiagnosis stream for the UI / future LLM driver
 *
 * Non-goals:
 *   - No LLM calls. This is grounding logic; an LLM can use it as context.
 *   - No UI. Consumers subscribe and render however they wish.
 *   - No mutations. Everything is read-only analysis.
 */
import { AgentRuntime } from "@/lib/agent";
import type { AgentContext, AgentSignal, AgentSignalKind } from "@/lib/agent/types";
import { RuntimeHealthMonitor, type HealthSnapshot } from "@/lib/observability";
import type { OperationalEvent } from "@/lib/operationalBus/OperationalEventBus";
import type {
  CauseMatch,
  EngineerCauseTag,
  EngineerDiagnosis,
  EngineerListener,
  FixProposal,
  IncidentReport,
  IncidentStatus,
  RootCauseHypothesis,
} from "./types";

/* ----------------------------------------------------------- config --- */

const RECOMPUTE_THROTTLE_MS = 500;
const EVIDENCE_MAX = 40;

/* ------------------------------------------------------------ state --- */

let booted = false;
let lastContext: AgentContext | null = null;
let lastSnapshot: HealthSnapshot | null = null;
let recomputeTimer: ReturnType<typeof setTimeout> | null = null;
let lastDiagnosis: EngineerDiagnosis | null = null;
const listeners = new Set<EngineerListener>();
const unsubscribers: Array<() => void> = [];

/* ----------------------------------------------------- public API ---- */

export function start(): void {
  if (booted) return;
  booted = true;

  unsubscribers.push(
    AgentRuntime.subscribe((ctx) => {
      lastContext = ctx;
      scheduleRecompute();
    }),
  );
  unsubscribers.push(
    RuntimeHealthMonitor.subscribe((snap) => {
      lastSnapshot = snap;
      scheduleRecompute();
    }),
  );

  lastContext = AgentRuntime.getContext();
  scheduleRecompute();
}

export function stop(): void {
  unsubscribers.splice(0).forEach((u) => { try { u(); } catch { /* noop */ } });
  if (recomputeTimer) { clearTimeout(recomputeTimer); recomputeTimer = null; }
  lastContext = null;
  lastSnapshot = null;
  lastDiagnosis = null;
  booted = false;
}

export function subscribe(fn: EngineerListener): () => void {
  listeners.add(fn);
  if (lastDiagnosis) {
    try { fn(lastDiagnosis); } catch { /* noop */ }
  } else {
    // Force first computation so consumers don't hang on empty UI.
    const d = buildDiagnosis();
    lastDiagnosis = d;
    try { fn(d); } catch { /* noop */ }
  }
  return () => { listeners.delete(fn); };
}

export function getDiagnosis(): EngineerDiagnosis {
  return lastDiagnosis ?? buildDiagnosis();
}

/**
 * Generate a printable incident report for a given signal (or the worst one
 * currently active).
 */
export function generateIncidentReport(target?: AgentSignal): IncidentReport {
  const ctx = lastContext ?? AgentRuntime.getContext();
  const signals = ctx.signals;
  const signal = target ?? signals[0] ?? null;

  const status: IncidentStatus = !signal
    ? "observing"
    : signal.urgency === "critical" ? "active"
    : signal.urgency === "high" ? "active"
    : "observing";

  const hypotheses = signal
    ? hypothesesForSignal(signal, ctx.recentEvents)
    : ctx.signals.flatMap((s) => hypothesesForSignal(s, ctx.recentEvents));

  const fixes = signal
    ? fixesForSignal(signal)
    : ctx.signals.flatMap((s) => fixesForSignal(s));

  const timeline = ctx.recentEvents.slice(-50).map((e) => ({
    at: e.occurredAt,
    severity: e.severity,
    source: e.source,
    text: e.title + (e.detail ? ` — ${e.detail}` : ""),
  }));

  const summary = signal
    ? `${signal.title}. ${signal.detail ?? ""}`.trim()
    : "Sistema sob observação — sem incidentes ativos no momento.";

  const id = `incident_${signal?.correlationKey ?? "snapshot"}_${Date.now()}`;
  const report: IncidentReport = {
    id,
    generatedAt: Date.now(),
    title: signal?.title ?? "Snapshot operacional",
    status,
    urgency: signal?.urgency ?? "low",
    summary,
    timeline,
    signals: signals.slice(0, 10),
    hypotheses,
    fixes,
    runtime: lastSnapshot,
    asText: "", // filled below
  };
  report.asText = renderReportAsText(report);
  return report;
}

/* ----------------------------------------------------- lifecycle ---- */

function scheduleRecompute() {
  if (recomputeTimer) return;
  recomputeTimer = setTimeout(() => {
    recomputeTimer = null;
    const d = buildDiagnosis();
    lastDiagnosis = d;
    fanout(d);
  }, RECOMPUTE_THROTTLE_MS);
}

function fanout(d: EngineerDiagnosis) {
  listeners.forEach((l) => { try { l(d); } catch { /* swallow */ } });
}

/* -------------------------------------------------- analysis core ---- */

function buildDiagnosis(): EngineerDiagnosis {
  const ctx = lastContext ?? AgentRuntime.getContext();
  const signals = ctx.signals;
  const primary = signals[0] ?? null;

  const hypotheses: RootCauseHypothesis[] = [];
  const fixes: FixProposal[] = [];
  for (const s of signals) {
    hypotheses.push(...hypothesesForSignal(s, ctx.recentEvents));
    fixes.push(...fixesForSignal(s));
  }

  // Rank
  hypotheses.sort((a, b) => b.confidence - a.confidence);
  fixes.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  const evidence = pickEvidence(ctx.recentEvents, hypotheses);

  return {
    generatedAt: Date.now(),
    primarySignal: primary,
    hypotheses,
    fixes,
    narrative: buildNarrative(primary, hypotheses, fixes, ctx),
    evidence,
    runtime: lastSnapshot,
  };
}

function classifySignal(kind: AgentSignalKind): CauseMatch {
  const map: Record<AgentSignalKind, EngineerCauseTag> = {
    provider_offline: "external_provider_down",
    ingest_stalled: "ingest_stalled",
    realtime_degraded: "realtime_link_unstable",
    edge_failing: "edge_function_unstable",
    repeat_failure: "repeat_logic_failure",
    error_burst: "error_burst",
    automation_failing: "automation_chain_break",
    data_inconsistency: "data_inconsistency",
  };
  return { tag: map[kind] ?? "unknown", signalKind: kind };
}

function hypothesesForSignal(
  signal: AgentSignal,
  events: OperationalEvent[],
): RootCauseHypothesis[] {
  const cause = classifySignal(signal.kind);
  const related = events.filter(
    (e) => e.correlationKey && signal.evidenceIds.includes(e.id),
  );
  const evIds = related.length
    ? related.map((e) => e.id)
    : signal.evidenceIds.slice(0, 5);

  // Base confidence from urgency + occurrence count + recency
  const recencySec = Math.max(1, (Date.now() - signal.lastSeenAt) / 1000);
  const recencyBoost = recencySec < 60 ? 0.15 : recencySec < 300 ? 0.05 : -0.1;
  const countBoost = Math.min(0.25, Math.log10(signal.count + 1) * 0.15);
  const urgencyBase =
    signal.urgency === "critical" ? 0.75
    : signal.urgency === "high" ? 0.6
    : signal.urgency === "normal" ? 0.45 : 0.3;
  const confidence = clamp01(urgencyBase + countBoost + recencyBoost);

  switch (cause.tag) {
    case "external_provider_down":
      return [{
        id: `h_${signal.correlationKey}_provider`,
        summary: "Provider externo offline ou com latência crítica",
        confidence,
        evidenceEventIds: evIds,
        relatedSignalIds: [signal.id],
        reasoning: [
          "Taxa de erro elevada e/ou latência alta no provider registado.",
          "Adapters via registry permitem fallback — verificar se está ativo.",
          "Causa típica: chave/credencial expirada, rate-limit do fornecedor, indisponibilidade regional.",
        ],
      }];
    case "ingest_stalled":
      return [{
        id: `h_${signal.correlationKey}_ingest`,
        summary: "Pipeline de ingestão parado — worker/cron não reportou nova execução",
        confidence,
        evidenceEventIds: evIds,
        relatedSignalIds: [signal.id],
        reasoning: [
          "Última execução do source ultrapassa o limiar configurado (6 min).",
          "Causa típica: scheduler desativado, edge function em erro, secret revogado.",
          "Sem ingest novo, signals downstream também ficam desatualizados.",
        ],
      }];
    case "realtime_link_unstable":
      return [{
        id: `h_${signal.correlationKey}_realtime`,
        summary: "Conexão realtime degradada — reconnections excessivas ou canais a cair",
        confidence,
        evidenceEventIds: evIds,
        relatedSignalIds: [signal.id],
        reasoning: [
          "RealtimeHub registou múltiplas reconexões na janela atual.",
          "Causa típica: rede do cliente, sessão expirada, indisponibilidade do realtime backend.",
          "Subscrições postgres_changes podem estar a perder eventos.",
        ],
      }];
    case "edge_function_unstable":
      return [{
        id: `h_${signal.correlationKey}_edge`,
        summary: "Edge function instável — múltiplas falhas recentes",
        confidence,
        evidenceEventIds: evIds,
        relatedSignalIds: [signal.id],
        reasoning: [
          "Failures repetidas registadas para a mesma função.",
          "Causa típica: payload inválido, secret ausente, timeout, dependência externa.",
          "Verificar logs no Cloud para a função identificada.",
        ],
      }];
    case "repeat_logic_failure":
      return [{
        id: `h_${signal.correlationKey}_repeat`,
        summary: "Falha recorrente com a mesma correlation_key — bug persistente",
        confidence,
        evidenceEventIds: evIds,
        relatedSignalIds: [signal.id],
        reasoning: [
          "O mesmo erro repetiu-se acima do limiar (≥3) na janela.",
          "Não é transitório — retry não resolve sem mudança de código/dados.",
          "Considerar desabilitar o caminho problemático até deploy de fix.",
        ],
      }];
    case "error_burst":
      return [{
        id: `h_${signal.correlationKey}_burst`,
        summary: "Pico de erros num único subsistema",
        confidence,
        evidenceEventIds: evIds,
        relatedSignalIds: [signal.id],
        reasoning: [
          "Vários componentes do mesmo source falharam em curta janela.",
          "Causa típica: deploy recente, mudança de schema, dependência externa em outage.",
          "Procurar correlação temporal com último deploy ou migração.",
        ],
      }];
    case "automation_chain_break":
      return [{
        id: `h_${signal.correlationKey}_automation`,
        summary: "Cadeia de automações a falhar",
        confidence,
        evidenceEventIds: evIds,
        relatedSignalIds: [signal.id],
        reasoning: [
          "Execuções automatizadas terminaram em erro repetidamente.",
          "Causa típica: condição/regra desatualizada, permissão RLS recente, dado fonte inválido.",
          "Risco de propagação a workflows dependentes.",
        ],
      }];
    case "data_inconsistency":
      return [{
        id: `h_${signal.correlationKey}_data`,
        summary: "Discrepâncias acumuladas — dados fora de sincronia",
        confidence,
        evidenceEventIds: evIds,
        relatedSignalIds: [signal.id],
        reasoning: [
          "Volume elevado de discrepâncias detetadas no módulo de confronto.",
          "Causa típica: importação inconsistente, normalização de placa/cliente, regra de matching alterada.",
          "Reconciliação manual ou re-run do motor de reconciliação pode resolver.",
        ],
      }];
    default:
      return [{
        id: `h_${signal.correlationKey}_unknown`,
        summary: signal.title,
        confidence: confidence * 0.7,
        evidenceEventIds: evIds,
        relatedSignalIds: [signal.id],
        reasoning: [
          "Padrão não classificado — recolher mais evidência antes de propor fix.",
          signal.detail ?? "",
        ].filter(Boolean),
      }];
  }
}

function fixesForSignal(signal: AgentSignal): FixProposal[] {
  const cause = classifySignal(signal.kind);
  switch (cause.tag) {
    case "external_provider_down":
      return [{
        id: `f_${signal.correlationKey}_failover`,
        title: "Acionar fallback do provider via registry",
        rationale: "O ProviderRegistry foi desenhado para permitir troca a frio. Forçar fallback restaura serviço sem alterar consumidores.",
        steps: [
          "Abrir Settings → Providers e verificar status (healthCheck).",
          "Marcar o provider primário como offline / desabilitado.",
          "Registar provider fallback equivalente (ex.: NOAA ↔ MeteoAlarm).",
          "Confirmar que latência e error rate baixam na próxima janela.",
        ],
        category: "external_provider",
        severity: signal.urgency === "critical" ? "blocker" : "major",
        estimatedMinutes: 5,
        requiresHumanApproval: true,
      }];
    case "ingest_stalled":
      return [{
        id: `f_${signal.correlationKey}_cron`,
        title: "Reativar pipeline de ingestão",
        rationale: "Ingest parado deixa todo o downstream cego. Restabelecer execução é prioridade.",
        steps: [
          "Identificar a source listada no signal.",
          "Verificar agendamento da edge function (cron / pg_cron).",
          "Inspecionar últimos logs em Lovable Cloud.",
          "Re-disparar manualmente e confirmar evento de ingest_ok no bus.",
        ],
        category: "infrastructure",
        severity: signal.urgency === "critical" ? "blocker" : "major",
        estimatedMinutes: 10,
        requiresHumanApproval: true,
      }];
    case "realtime_link_unstable":
      return [{
        id: `f_${signal.correlationKey}_realtime`,
        title: "Estabilizar conexão realtime",
        rationale: "Reconnections excessivas indicam camada de transporte instável; reduz fiabilidade de UI live.",
        steps: [
          "Confirmar conectividade do cliente (não-VPN, rede estável).",
          "Verificar status do realtime backend.",
          "Forçar reload da app se reconnect counter continuar a crescer.",
          "Se persistir, reduzir número de canais subscritos simultâneos.",
        ],
        category: "infrastructure",
        severity: "moderate",
        estimatedMinutes: 5,
        requiresHumanApproval: false,
      }];
    case "edge_function_unstable":
      return [{
        id: `f_${signal.correlationKey}_edge`,
        title: "Investigar edge function instável",
        rationale: "Falhas repetidas numa função tendem a indicar problema determinístico, não transitório.",
        steps: [
          "Abrir logs da função identificada em Lovable Cloud.",
          "Verificar secrets requeridos (LOVABLE_API_KEY, provider keys).",
          "Validar payload de entrada com Zod.",
          "Subir patch e confirmar queda de error rate.",
        ],
        category: "code",
        severity: signal.urgency === "critical" ? "blocker" : "major",
        estimatedMinutes: 20,
        requiresHumanApproval: true,
      }];
    case "repeat_logic_failure":
      return [{
        id: `f_${signal.correlationKey}_logic`,
        title: "Corrigir falha lógica persistente",
        rationale: "A mesma correlation_key falhou múltiplas vezes — retry não resolverá.",
        steps: [
          "Localizar o código associado à correlation_key.",
          "Reproduzir cenário com o payload do último evento.",
          "Adicionar guarda / fix e teste de regressão.",
          "Deployar e confirmar que o signal desaparece da janela.",
        ],
        category: "code",
        severity: "major",
        estimatedMinutes: 30,
        requiresHumanApproval: true,
      }];
    case "error_burst":
      return [{
        id: `f_${signal.correlationKey}_burst`,
        title: "Conter pico de erros",
        rationale: "Vários componentes do mesmo subsistema falham simultaneamente — causa comum a investigar.",
        steps: [
          "Correlacionar com último deploy / migração.",
          "Verificar mudança recente de schema ou política RLS.",
          "Reverter alteração ofensora se identificada.",
          "Monitorar próxima janela para confirmar recuperação.",
        ],
        category: "deployment",
        severity: signal.urgency === "critical" ? "blocker" : "major",
        estimatedMinutes: 15,
        requiresHumanApproval: true,
      }];
    case "automation_chain_break":
      return [{
        id: `f_${signal.correlationKey}_automation`,
        title: "Revisar regras de automação",
        rationale: "Execuções automatizadas falhando podem propagar erro a múltiplos módulos.",
        steps: [
          "Abrir histórico de automações.",
          "Identificar condições / triggers que mudaram recentemente.",
          "Pausar regras críticas até validação.",
          "Reativar gradualmente após patch.",
        ],
        category: "configuration",
        severity: "moderate",
        estimatedMinutes: 15,
        requiresHumanApproval: true,
      }];
    case "data_inconsistency":
      return [{
        id: `f_${signal.correlationKey}_reconcile`,
        title: "Reconciliar dados divergentes",
        rationale: "Volume elevado de discrepâncias indica desalinhamento entre fontes (OS / OP).",
        steps: [
          "Abrir módulo Confronto OS/OP.",
          "Filtrar pendências mais recentes.",
          "Aplicar merge manual onde score for >= 80%.",
          "Re-executar motor de reconciliação se necessário.",
        ],
        category: "data",
        severity: "moderate",
        estimatedMinutes: 20,
        requiresHumanApproval: true,
      }];
    default:
      return [{
        id: `f_${signal.correlationKey}_observe`,
        title: "Aumentar observabilidade",
        rationale: "Sinal não classificado — recolher evidência antes de agir.",
        steps: [
          "Anexar runtime snapshot ao incident report.",
          "Capturar screenshot do estado atual.",
          "Aguardar próxima ocorrência e re-avaliar.",
        ],
        category: "observability",
        severity: "minor",
        estimatedMinutes: 5,
        requiresHumanApproval: false,
      }];
  }
}

function buildNarrative(
  primary: AgentSignal | null,
  hypotheses: RootCauseHypothesis[],
  fixes: FixProposal[],
  ctx: AgentContext,
): string {
  if (!primary) {
    const total = Object.values(ctx.counters).reduce((a, c) => a + c.total, 0);
    return `Sem incidentes ativos. ${total} eventos observados na janela atual; nenhum requer ação.`;
  }
  const top = hypotheses[0];
  const fix = fixes[0];
  const parts = [
    `Sinal primário: ${primary.title} (${primary.urgency}).`,
    primary.detail ? primary.detail : "",
    top ? `Hipótese mais provável (${Math.round(top.confidence * 100)}%): ${top.summary}.` : "",
    fix ? `Ação sugerida: ${fix.title}.` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

/* --------------------------------------------------------- helpers --- */

function pickEvidence(
  events: OperationalEvent[],
  hypotheses: RootCauseHypothesis[],
): OperationalEvent[] {
  const wanted = new Set<string>();
  hypotheses.forEach((h) => h.evidenceEventIds.forEach((id) => wanted.add(id)));
  const matched = events.filter((e) => wanted.has(e.id));
  if (matched.length >= EVIDENCE_MAX) return matched.slice(-EVIDENCE_MAX);
  // Pad with most recent errors/criticals for context
  const extras = events
    .filter((e) => !wanted.has(e.id) && (e.severity === "error" || e.severity === "critical"))
    .slice(-(EVIDENCE_MAX - matched.length));
  return [...matched, ...extras].slice(-EVIDENCE_MAX);
}

function severityRank(s: FixProposal["severity"]): number {
  return { blocker: 4, major: 3, moderate: 2, minor: 1 }[s];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function renderReportAsText(r: IncidentReport): string {
  const lines: string[] = [];
  lines.push(`# Incident Report — ${r.title}`);
  lines.push(`ID: ${r.id}`);
  lines.push(`Gerado: ${new Date(r.generatedAt).toISOString()}`);
  lines.push(`Status: ${r.status}  ·  Urgência: ${r.urgency}`);
  lines.push("");
  lines.push("## Resumo");
  lines.push(r.summary);
  lines.push("");

  if (r.signals.length) {
    lines.push("## Sinais Ativos");
    r.signals.forEach((s) => {
      lines.push(`- [${s.urgency}] ${s.title}${s.detail ? ` — ${s.detail}` : ""}`);
    });
    lines.push("");
  }

  if (r.hypotheses.length) {
    lines.push("## Hipóteses de Causa-Raiz");
    r.hypotheses.forEach((h) => {
      lines.push(`- (${Math.round(h.confidence * 100)}%) ${h.summary}`);
      h.reasoning.forEach((line) => lines.push(`    · ${line}`));
    });
    lines.push("");
  }

  if (r.fixes.length) {
    lines.push("## Ações Propostas");
    r.fixes.forEach((f) => {
      lines.push(`- [${f.severity}] ${f.title}`);
      lines.push(`    Categoria: ${f.category}`);
      lines.push(`    Justificação: ${f.rationale}`);
      f.steps.forEach((s, i) => lines.push(`    ${i + 1}. ${s}`));
    });
    lines.push("");
  }

  if (r.runtime) {
    lines.push("## Runtime Snapshot");
    lines.push(`Realtime: ${r.runtime.realtime.status} · reconnects=${r.runtime.realtime.reconnects} · canais=${r.runtime.realtime.channelsOpen}`);
    const providers = Object.entries(r.runtime.providers);
    if (providers.length) {
      providers.forEach(([k, p]) =>
        lines.push(`Provider ${k}: errRate=${(p.errorRate * 100).toFixed(0)}% · lat=${Math.round(p.avgLatencyMs)}ms · n=${p.samples}`),
      );
    }
    lines.push("");
  }

  if (r.timeline.length) {
    lines.push("## Timeline (últimos eventos)");
    r.timeline.slice(-20).forEach((t) => {
      const ts = new Date(t.at).toISOString().substring(11, 19);
      lines.push(`${ts} [${t.severity}] ${t.source} — ${t.text}`);
    });
  }
  return lines.join("\n");
}

/* ----------------------------------------------------------- export -- */

export const VirtualEngineer = {
  start,
  stop,
  subscribe,
  getDiagnosis,
  generateIncidentReport,
};

export default VirtualEngineer;
