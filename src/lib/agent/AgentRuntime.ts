/**
 * AgentRuntime — operational intelligence core.
 *
 * Listens to:
 *  - OperationalEventBus (unified event stream)
 *  - RuntimeHealthMonitor (live health snapshots)
 *
 * Produces:
 *  - Rolling operational context (recent events + counters)
 *  - Classified signals (ingest stalled, provider offline, error bursts…)
 *  - Prioritised, human-readable suggestions
 *
 * Non-goals (yet):
 *  - No multimodal, no voice, no screenshots.
 *  - No LLM calls. This is the deterministic substrate the LLM driver will
 *    sit on top of in a later phase.
 *
 * Lifecycle:
 *  - Singleton, idempotent. `AgentRuntime.start()` after bus is booted.
 */
import {
  OperationalEventBus,
  type OperationalEvent,
  type OpSeverity,
  type OpSource,
} from "@/lib/operationalBus/OperationalEventBus";
import { RuntimeHealthMonitor, type HealthSnapshot } from "@/lib/observability";
import { notify } from "@/lib/notifications";
import type {
  AgentContext,
  AgentListener,
  AgentSignal,
  AgentSignalKind,
  AgentUrgency,
} from "./types";

/* ------------------------------------------------------------ config --- */

const WINDOW_MS = 10 * 60 * 1000;       // 10 min rolling context
const RECENT_MAX = 200;                  // bounded recency buffer
const INGEST_STALL_MS = 6 * 60 * 1000;   // no ingest for 6 min → stalled
const ERROR_BURST_COUNT = 5;             // 5+ errors in window from same source
const REPEAT_FAILURE_COUNT = 3;          // same correlation_key ≥3 times
const RECOMPUTE_THROTTLE_MS = 400;       // coalesce bursts of incoming events

/* ------------------------------------------------------------ state --- */

const recentEvents: OperationalEvent[] = [];
const signals = new Map<string, AgentSignal>();         // key → signal
const listeners = new Set<AgentListener>();

let lastSnapshot: HealthSnapshot | null = null;
let recomputeTimer: ReturnType<typeof setTimeout> | null = null;
let booted = false;
const unsubscribers: Array<() => void> = [];

/* ----------------------------------------------------- public API ---- */

export function start(): void {
  if (booted) return;
  booted = true;

  unsubscribers.push(OperationalEventBus.subscribe(onEvent));
  unsubscribers.push(RuntimeHealthMonitor.subscribe(onHealth));

  // Hydrate from any pre-existing buffer
  for (const e of OperationalEventBus.getBuffer()) pushRaw(e);
  scheduleRecompute();
}

export function stop(): void {
  unsubscribers.splice(0).forEach((u) => { try { u(); } catch { /* noop */ } });
  recentEvents.length = 0;
  signals.clear();
  if (recomputeTimer) { clearTimeout(recomputeTimer); recomputeTimer = null; }
  booted = false;
}

export function subscribe(fn: AgentListener): () => void {
  listeners.add(fn);
  // Emit current context immediately so consumers don't see an empty UI flicker.
  try { fn(buildContext()); } catch { /* noop */ }
  return () => { listeners.delete(fn); };
}

export function getContext(): AgentContext {
  return buildContext();
}

export function getSignals(): AgentSignal[] {
  return [...signals.values()].sort((a, b) => a.priority - b.priority);
}

/* ----------------------------------------------------- ingestion ---- */

function onEvent(evt: OperationalEvent) {
  pushRaw(evt);
  scheduleRecompute();
}

function onHealth(snap: HealthSnapshot) {
  lastSnapshot = snap;
  scheduleRecompute();
}

function pushRaw(evt: OperationalEvent) {
  recentEvents.push(evt);
  if (recentEvents.length > RECENT_MAX) {
    recentEvents.splice(0, recentEvents.length - RECENT_MAX);
  }
}

function scheduleRecompute() {
  if (recomputeTimer) return;
  recomputeTimer = setTimeout(() => {
    recomputeTimer = null;
    recompute();
  }, RECOMPUTE_THROTTLE_MS);
}

/* ---------------------------------------- classification engine ---- */

function recompute() {
  const now = Date.now();
  const windowFrom = now - WINDOW_MS;

  // GC stale recent events
  while (recentEvents.length && recentEvents[0].occurredAt < windowFrom) {
    recentEvents.shift();
  }

  // Reset signals; we rebuild deterministically per window. (Stable correlation
  // keys mean consumers can still diff if they need to.)
  signals.clear();

  detectRepeatFailures(now);
  detectErrorBursts(now);
  detectAutomationFailures(now);
  detectDataInconsistencies(now);
  detectFromHealth(now);
  detectIngestStalled(now);

  dispatchCriticalNotifications();
  fanout();
}

function detectRepeatFailures(now: number) {
  const bySource: Record<string, OperationalEvent[]> = {};
  for (const e of recentEvents) {
    if (!e.correlationKey) continue;
    if (e.severity !== "error" && e.severity !== "critical") continue;
    (bySource[e.correlationKey] ??= []).push(e);
  }
  for (const [key, group] of Object.entries(bySource)) {
    if (group.length < REPEAT_FAILURE_COUNT) continue;
    const last = group[group.length - 1];
    upsert({
      kind: "repeat_failure",
      correlationKey: `repeat:${key}`,
      urgency: last.severity === "critical" ? "critical" : "high",
      title: `Falha recorrente: ${last.title}`,
      detail: `${group.length} ocorrências em ${Math.round((now - group[0].occurredAt) / 60000)} min.`,
      suggestion:
        "Verifique a origem do erro — falhas repetidas indicam problema persistente, " +
        "não transitório. Considere desabilitar a fonte ou ativar fallback.",
      evidenceIds: group.map((g) => g.id),
      firstSeenAt: group[0].occurredAt,
      lastSeenAt: last.occurredAt,
      count: group.length,
      metadata: { source: last.source },
    });
  }
}

function detectErrorBursts(now: number) {
  const counts: Record<OpSource, OperationalEvent[]> = {} as any;
  for (const e of recentEvents) {
    if (e.severity === "error" || e.severity === "critical") {
      (counts[e.source] ??= []).push(e);
    }
  }
  for (const [source, group] of Object.entries(counts) as [OpSource, OperationalEvent[]][]) {
    if (group.length < ERROR_BURST_COUNT) continue;
    upsert({
      kind: "error_burst",
      correlationKey: `burst:${source}`,
      urgency: group.some((g) => g.severity === "critical") ? "critical" : "high",
      title: `Pico de erros em ${source}`,
      detail: `${group.length} erros nos últimos ${Math.round(WINDOW_MS / 60000)} min.`,
      suggestion:
        "Vários componentes do mesmo subsistema estão falhando ao mesmo tempo. " +
        "Investigue causa comum (deploy recente, provider externo, credencial expirada).",
      evidenceIds: group.slice(-10).map((g) => g.id),
      firstSeenAt: group[0].occurredAt,
      lastSeenAt: group[group.length - 1].occurredAt,
      count: group.length,
      metadata: { source },
    });
  }
}

function detectAutomationFailures(now: number) {
  const fails = recentEvents.filter(
    (e) => e.source === "automation_executions" && e.severity === "error",
  );
  if (fails.length < 2) return;
  const last = fails[fails.length - 1];
  upsert({
    kind: "automation_failing",
    correlationKey: "automation:failing",
    urgency: fails.length >= 5 ? "high" : "normal",
    title: "Automações com falhas",
    detail: `${fails.length} execuções falharam recentemente.`,
    suggestion:
      "Abra o histórico de automações e revise condições/regras. " +
      "Falhas em série geralmente indicam mudança de schema ou de permissão.",
    evidenceIds: fails.slice(-5).map((g) => g.id),
    firstSeenAt: fails[0].occurredAt,
    lastSeenAt: last.occurredAt,
    count: fails.length,
  });
}

function detectDataInconsistencies(now: number) {
  const disc = recentEvents.filter((e) => e.source === "discrepancies");
  if (disc.length < 3) return;
  const last = disc[disc.length - 1];
  upsert({
    kind: "data_inconsistency",
    correlationKey: "data:discrepancies",
    urgency: disc.length >= 10 ? "high" : "normal",
    title: "Discrepâncias acumuladas",
    detail: `${disc.length} discrepâncias detectadas na janela atual.`,
    suggestion:
      "Acesse o módulo de confronto OS/OP e revise as pendências. " +
      "Volume elevado indica importação inconsistente ou regra fora de sincronia.",
    evidenceIds: disc.slice(-5).map((g) => g.id),
    firstSeenAt: disc[0].occurredAt,
    lastSeenAt: last.occurredAt,
    count: disc.length,
  });
}

function detectFromHealth(now: number) {
  if (!lastSnapshot) return;

  // Realtime degraded / down
  const rt = lastSnapshot.realtime;
  if (rt.status === "down" || rt.status === "degraded") {
    upsert({
      kind: "realtime_degraded",
      correlationKey: `realtime:${rt.status}`,
      urgency: rt.status === "down" ? "critical" : "high",
      title: `Realtime ${rt.status === "down" ? "indisponível" : "degradado"}`,
      detail: rt.lastError ?? `Reconexões: ${rt.reconnects}, canais: ${rt.channelsOpen}`,
      suggestion:
        "Atualizações ao vivo podem estar atrasadas. Verifique conectividade do cliente " +
        "e status do Realtime no backend. Tente recarregar a aplicação se persistir.",
      evidenceIds: [],
      firstSeenAt: rt.lastErrorAt ?? rt.lastReconnectAt ?? now,
      lastSeenAt: now,
      count: rt.reconnects || 1,
      metadata: { reconnects: rt.reconnects, channels: rt.channelsOpen },
    });
  }

  // Edge function failures (recurring)
  const edgeByFn: Record<string, number> = {};
  let mostRecentEdge = 0;
  for (const f of lastSnapshot.edgeFailures) {
    edgeByFn[f.fn] = (edgeByFn[f.fn] ?? 0) + 1;
    if (f.at > mostRecentEdge) mostRecentEdge = f.at;
  }
  for (const [fn, n] of Object.entries(edgeByFn)) {
    if (n < 2) continue;
    upsert({
      kind: "edge_failing",
      correlationKey: `edge:${fn}`,
      urgency: n >= 5 ? "critical" : "high",
      title: `Edge function instável: ${fn}`,
      detail: `${n} falhas registradas.`,
      suggestion:
        "Verifique logs da função no painel de Lovable Cloud. " +
        "Falhas repetidas podem indicar secret ausente, payload inválido ou timeout.",
      evidenceIds: [],
      firstSeenAt: lastSnapshot.edgeFailures.find((f) => f.fn === fn)?.at ?? now,
      lastSeenAt: mostRecentEdge,
      count: n,
      metadata: { fn },
    });
  }

  // Providers offline (error rate too high)
  for (const [key, p] of Object.entries(lastSnapshot.providers)) {
    if (p.samples < 3) continue;
    if (p.errorRate < 0.5) continue;
    upsert({
      kind: "provider_offline",
      correlationKey: `provider:${key}`,
      urgency: p.errorRate >= 0.9 ? "critical" : "high",
      title: `Provider degradado: ${key}`,
      detail: `Taxa de erro ${(p.errorRate * 100).toFixed(0)}% em ${p.samples} amostras, latência média ${Math.round(p.avgLatencyMs)}ms.`,
      suggestion:
        "Provider externo aparentemente offline ou com alta latência. " +
        "Sistema pode estar usando fallback — verifique registry de providers.",
      evidenceIds: [],
      firstSeenAt: p.lastAt,
      lastSeenAt: p.lastAt,
      count: p.samples,
      metadata: { errorRate: p.errorRate, avgLatencyMs: p.avgLatencyMs },
    });
  }
}

function detectIngestStalled(now: number) {
  if (!lastSnapshot) return;
  for (const [src, info] of Object.entries(lastSnapshot.ingestion)) {
    if (!info.lastAt) continue;
    const age = now - info.lastAt;
    if (age < INGEST_STALL_MS) continue;
    upsert({
      kind: "ingest_stalled",
      correlationKey: `ingest:${src}`,
      urgency: age > INGEST_STALL_MS * 3 ? "critical" : "high",
      title: `Ingest parado: ${src}`,
      detail: `Última execução há ${Math.round(age / 60000)} min.`,
      suggestion:
        "Cron ou worker pode ter parado. Verifique agendamento da edge function " +
        "e os últimos logs de execução. Considere reiniciar o cron.",
      evidenceIds: [],
      firstSeenAt: info.lastAt,
      lastSeenAt: info.lastAt,
      count: info.failures || 1,
      metadata: { ageMs: age, lastOk: info.lastOk },
    });
  }
}

/* ----------------------------------------------------- utilities ---- */

function upsert(input: Omit<AgentSignal, "id" | "priority"> & { priority?: number }) {
  const priority = input.priority ?? priorityFor(input.urgency, input.kind);
  const id = `sig_${input.correlationKey}`;
  signals.set(input.correlationKey, { ...input, id, priority });
}

function priorityFor(urgency: AgentUrgency, kind: AgentSignalKind): number {
  const base = { critical: 5, high: 25, normal: 50, low: 75 }[urgency];
  const boost =
    kind === "ingest_stalled" || kind === "provider_offline" || kind === "realtime_degraded"
      ? -5 : 0;
  return Math.max(0, Math.min(100, base + boost));
}

function buildContext(): AgentContext {
  const now = Date.now();
  const counters = {} as AgentContext["counters"];
  const bySeverity: AgentContext["bySeverity"] = {
    info: 0, warn: 0, error: 0, critical: 0,
  };
  for (const e of recentEvents) {
    const c = (counters[e.source] ??= { total: 0, errors: 0, lastAt: 0 });
    c.total += 1;
    if (e.severity === "error" || e.severity === "critical") c.errors += 1;
    if (e.occurredAt > c.lastAt) c.lastAt = e.occurredAt;
    bySeverity[e.severity] += 1;
  }
  return {
    recentEvents: [...recentEvents],
    signals: getSignals(),
    counters,
    bySeverity,
    windowMs: WINDOW_MS,
    generatedAt: now,
  };
}

function fanout() {
  const ctx = buildContext();
  listeners.forEach((l) => { try { l(ctx); } catch { /* swallow */ } });
}

/**
 * Routes high/critical signals to the NotificationRegistry. Dedup, cooldown
 * and rate limiting are enforced downstream by the registry, so this is safe
 * to call on every recompute.
 */
function dispatchCriticalNotifications() {
  for (const sig of signals.values()) {
    if (sig.urgency !== "high" && sig.urgency !== "critical") continue;
    void notify({
      key: `agent:${sig.correlationKey}`,
      title: sig.title,
      body: [sig.detail, sig.suggestion].filter(Boolean).join("\n\n"),
      audience: sig.urgency === "critical" ? ["admin", "developer", "owner"] : ["admin", "ops"],
      priority: sig.urgency,
      source: "agent",
      metadata: { kind: sig.kind, count: sig.count, ...sig.metadata },
      occurredAt: sig.lastSeenAt,
    });
  }
}

/* ---------------------------------------------------------- export --- */

export const AgentRuntime = {
  start,
  stop,
  subscribe,
  getContext,
  getSignals,
};

export default AgentRuntime;
