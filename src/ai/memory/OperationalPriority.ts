/**
 * OperationalPriority — deterministic priority engine for the AI assistant.
 *
 * Classifies operational signals into HIGH / MEDIUM / LOW with a numeric
 * score so the assistant can:
 *   - escalate intelligently (only HIGH interrupts; MEDIUM hints; LOW is silent)
 *   - avoid unnecessary interruptions (cooldown + throttle per priority)
 *   - prioritize operationally critical events first
 *
 * Pure functions. No emotions, no chat behavior. Realtime copilot, not chatbot.
 */
import type { OperationalSignal, SignalLevel } from "@/hooks/useOperationalSignals";
import { operationalMemory } from "./OperationalMemory";

export type Priority = "high" | "medium" | "low";

export interface PrioritizedSignal {
  signal: OperationalSignal;
  priority: Priority;
  /** Higher = more urgent. Used to sort and break ties. */
  score: number;
  reasons: string[];
}

/** Cooldown windows by priority — protect the user from interruption. */
export const PRIORITY_COOLDOWN_MS: Record<Priority, number> = {
  high: 30_000,     // critical: can re-surface fairly quickly
  medium: 5 * 60_000,
  low: 30 * 60_000, // low priority hints: rarely
};

/**
 * Base classification: maps known signal ids → priority.
 * Anything not listed falls back to level-based mapping.
 */
const BASE_PRIORITY: Record<string, Priority> = {
  // HIGH — operational integrity at risk
  "radar-stale": "high",            // realtime ingestion outage
  "alert-spike": "high",            // multiple runtime errors
  "runtime-errors": "high",         // any runtime error
  "payments-failure": "high",       // (reserved for future failure signal)

  // MEDIUM — operational throughput affected
  "platforms-degraded": "medium",
  "payments-overdue": "medium",
  "so-stalled": "medium",
  "production-drop": "medium",
  "techs-inactive": "medium",

  // LOW — informational
  "radar-empty": "low",
  "workspace-idle": "low",
};

/** Base score by priority (used for ordering across categories). */
const BASE_SCORE: Record<Priority, number> = { high: 100, medium: 50, low: 10 };

/** Fallback from SignalLevel when id is unknown. */
function priorityFromLevel(level: SignalLevel): Priority {
  if (level === "error") return "high";
  if (level === "warn") return "medium";
  return "low";
}

export function classifySignal(signal: OperationalSignal): PrioritizedSignal {
  if (signal.level === "ok" || signal.id === "all-ok") {
    return { signal, priority: "low", score: 0, reasons: ["ok"] };
  }

  const reasons: string[] = [];
  let priority: Priority = BASE_PRIORITY[signal.id] ?? priorityFromLevel(signal.level);
  reasons.push(`base:${priority}`);
  let score = BASE_SCORE[priority];

  // Recurrence escalation — repeated anomalies bump priority one tier.
  if (operationalMemory.isRecurring(signal.id)) {
    if (priority === "low") { priority = "medium"; reasons.push("escalated:recurring→medium"); }
    else if (priority === "medium") { priority = "high"; reasons.push("escalated:recurring→high"); }
    else reasons.push("recurring");
    score += 25;
  }

  // Same-session repetition adds weight without changing tier.
  const seen = operationalMemory.hasSeenSignal(signal.id);
  if (seen && seen.occurrences > 1) {
    score += Math.min(20, seen.occurrences * 4);
    reasons.push(`repeats:${seen.occurrences}`);
  }

  // Error-level always at least HIGH.
  if (signal.level === "error" && priority !== "high") {
    priority = "high";
    score = Math.max(score, BASE_SCORE.high);
    reasons.push("level:error→high");
  }

  return { signal, priority, score, reasons };
}

export function prioritize(signals: OperationalSignal[]): PrioritizedSignal[] {
  return signals
    .filter((s) => s.level !== "ok" && s.id !== "all-ok")
    .map(classifySignal)
    .sort((a, b) => b.score - a.score);
}

/**
 * Stateful gate: returns the top priority signal that is allowed to
 * "interrupt" right now (respecting per-priority cooldowns and de-dup).
 *
 * Caller is expected to act on the returned signal at most once per call —
 * subsequent calls within the cooldown window return null for that id/tier.
 */
class PriorityGate {
  private lastFiredAt = new Map<string, number>();        // by signal id
  private lastTierFiredAt: Record<Priority, number> = {
    high: 0, medium: 0, low: 0,
  };

  pickInterruption(prioritized: PrioritizedSignal[]): PrioritizedSignal | null {
    const now = Date.now();
    for (const p of prioritized) {
      // LOW never interrupts — it is silent, surface-only.
      if (p.priority === "low") continue;
      const cooldown = PRIORITY_COOLDOWN_MS[p.priority];
      const lastForId = this.lastFiredAt.get(p.signal.id) ?? 0;
      const lastForTier = this.lastTierFiredAt[p.priority];
      if (now - lastForId < cooldown) continue;
      if (now - lastForTier < Math.min(cooldown, 8_000)) continue; // global per-tier breather
      this.lastFiredAt.set(p.signal.id, now);
      this.lastTierFiredAt[p.priority] = now;
      return p;
    }
    return null;
  }

  reset() {
    this.lastFiredAt.clear();
    this.lastTierFiredAt = { high: 0, medium: 0, low: 0 };
  }
}

export const priorityGate = new PriorityGate();
