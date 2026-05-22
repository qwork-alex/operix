/**
 * ConversationOrchestrator — proactively decides when the agent
 * should *initiate* a contextual conversation with the operator.
 *
 * Hard rules (no spam):
 *   - Only fires on AgentSignal of urgency >= "high" OR a confirmed
 *     RootCauseHypothesis with confidence >= 0.55.
 *   - Per-correlationKey dedup: same problem never re-fires until
 *     COOLDOWN_MS elapses OR signal escalates urgency.
 *   - Globally rate-limited: at most one new prompt per MIN_GAP_MS.
 *   - Dismissals are remembered for DISMISS_MS.
 *   - Snoozed/muted keys are persisted in localStorage.
 */
import { VirtualEngineer } from "@/lib/virtualEngineer";
import type { EngineerDiagnosis, FixProposal } from "@/lib/virtualEngineer";
import type { AgentSignal } from "@/lib/agent/types";

export interface ConversationPrompt {
  id: string;
  correlationKey: string;
  signal: AgentSignal;
  question: string;
  detail?: string;
  fixes: FixProposal[];
  createdAt: number;
  urgency: AgentSignal["urgency"];
}

type Listener = (p: ConversationPrompt | null) => void;

const COOLDOWN_MS = 3 * 60_000;    // same issue won't re-prompt for 3m
const MIN_GAP_MS = 45_000;         // at least 45s between *any* prompts
const DISMISS_MS = 10 * 60_000;    // dismissed = silent for 10m
const MUTE_STORE = "qwork.agent.convo.muted.v1";

function loadMuted(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(MUTE_STORE) || "{}"); } catch { return {}; }
}
function saveMuted(m: Record<string, number>) {
  try { localStorage.setItem(MUTE_STORE, JSON.stringify(m)); } catch {/*noop*/}
}

const URGENCY_RANK: Record<AgentSignal["urgency"], number> = {
  low: 0, normal: 1, high: 2, critical: 3,
};

function questionFor(signal: AgentSignal): string {
  switch (signal.kind) {
    case "ingest_stalled":
      return `Detectei falha de ingestão em ${signal.metadata?.source ?? "fonte operacional"}. Deseja abrir diagnóstico?`;
    case "provider_offline":
      return `Provider externo aparenta estar offline. Quer que eu analise o impacto?`;
    case "realtime_degraded":
      return `O canal de realtime está degradado. Deseja diagnosticar a conexão?`;
    case "edge_failing":
      return `Uma edge function está a falhar repetidamente. Quer ver os logs?`;
    case "error_burst":
      return `Burst de erros detectado. Posso correlacionar a causa raiz?`;
    case "repeat_failure":
      return `Falha recorrente identificada. Deseja investigar agora?`;
    case "automation_failing":
      return `Uma automação está a quebrar. Quer abrir diagnóstico?`;
    case "data_inconsistency":
      return `Inconsistência de dados detectada. Posso mostrar os pontos divergentes?`;
    default:
      return `Detectei um sinal operacional relevante. Deseja abrir diagnóstico?`;
  }
}

class Orchestrator {
  private current: ConversationPrompt | null = null;
  private listeners = new Set<Listener>();
  private lastFireAt = 0;
  private lastFireByKey = new Map<string, { at: number; urgency: number }>();
  private dismissed = new Map<string, number>();
  private muted = loadMuted();
  private started = false;
  private unsub: (() => void) | null = null;

  start() {
    if (this.started) return;
    this.started = true;
    VirtualEngineer.start();
    this.unsub = VirtualEngineer.subscribe((d) => this.evaluate(d));
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
    this.started = false;
  }

  current_(): ConversationPrompt | null { return this.current; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.current);
    return () => this.listeners.delete(fn);
  }

  dismiss(id: string) {
    if (this.current?.id === id) {
      this.dismissed.set(this.current.correlationKey, Date.now());
      this.setCurrent(null);
    }
  }

  mute(id: string) {
    if (this.current?.id === id) {
      this.muted[this.current.correlationKey] = Date.now();
      saveMuted(this.muted);
      this.setCurrent(null);
    }
  }

  /** Manually clear the active prompt (e.g. after user accepted). */
  consume(id: string) {
    if (this.current?.id === id) this.setCurrent(null);
  }

  private setCurrent(p: ConversationPrompt | null) {
    this.current = p;
    this.listeners.forEach((fn) => fn(p));
  }

  private evaluate(diag: EngineerDiagnosis) {
    if (!diag.primarySignal) return;
    const s = diag.primarySignal;
    const now = Date.now();
    const key = s.correlationKey;

    // Muted forever-ish until user clears (we still allow critical escalation)
    if (this.muted[key] && s.urgency !== "critical") return;

    // Recently dismissed
    const dis = this.dismissed.get(key);
    if (dis && now - dis < DISMISS_MS && s.urgency !== "critical") return;

    // Cooldown per-key, unless urgency escalated
    const last = this.lastFireByKey.get(key);
    if (last) {
      const escalated = URGENCY_RANK[s.urgency] > last.urgency;
      if (!escalated && now - last.at < COOLDOWN_MS) return;
    }

    // Only meaningful signals
    const meaningful =
      s.urgency === "critical" ||
      s.urgency === "high" ||
      diag.hypotheses.some((h) => h.confidence >= 0.55);
    if (!meaningful) return;

    // Global rate-limit (skip for critical)
    if (s.urgency !== "critical" && now - this.lastFireAt < MIN_GAP_MS) return;

    // Avoid re-emitting if same prompt is already active
    if (this.current?.correlationKey === key) return;

    const prompt: ConversationPrompt = {
      id: `cp_${now}_${Math.random().toString(36).slice(2, 7)}`,
      correlationKey: key,
      signal: s,
      question: questionFor(s),
      detail: s.detail || diag.hypotheses[0]?.summary,
      fixes: diag.fixes.slice(0, 3),
      createdAt: now,
      urgency: s.urgency,
    };

    this.lastFireAt = now;
    this.lastFireByKey.set(key, { at: now, urgency: URGENCY_RANK[s.urgency] });
    this.setCurrent(prompt);
  }
}

export const ConversationOrchestrator = new Orchestrator();
