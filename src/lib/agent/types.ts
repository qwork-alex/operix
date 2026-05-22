/**
 * AgentRuntime — operational core type surface.
 *
 * The runtime ingests OperationalEvent stream + RuntimeHealth snapshots and
 * produces a higher-order, opinionated view of the system: classifications,
 * detected patterns, and prioritised suggestions for the human operator (or
 * a future LLM driver).
 */
import type { OperationalEvent, OpSeverity, OpSource } from "@/lib/operationalBus/OperationalEventBus";

export type AgentSignalKind =
  | "ingest_stalled"
  | "provider_offline"
  | "realtime_degraded"
  | "edge_failing"
  | "error_burst"
  | "repeat_failure"
  | "automation_failing"
  | "data_inconsistency";

export type AgentUrgency = "low" | "normal" | "high" | "critical";

/**
 * A classified, deduplicated finding produced by the runtime.
 * Multiple raw events may collapse into a single signal.
 */
export interface AgentSignal {
  id: string;
  kind: AgentSignalKind;
  urgency: AgentUrgency;
  priority: number;          // 0 (highest) → 100 (lowest)
  title: string;
  detail?: string;
  suggestion?: string;       // human-actionable recommendation
  evidenceIds: string[];     // OperationalEvent.id references
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
  /** stable key used for dedup / update-in-place */
  correlationKey: string;
  metadata?: Record<string, unknown>;
}

export interface AgentContext {
  /** Last N raw operational events (recency buffer). */
  recentEvents: OperationalEvent[];
  /** Active classified signals, highest priority first. */
  signals: AgentSignal[];
  /** Per-source rolling counters over the context window. */
  counters: Record<OpSource, { total: number; errors: number; lastAt: number }>;
  /** Per-severity totals over the window. */
  bySeverity: Record<OpSeverity, number>;
  /** Window length used for counters (ms). */
  windowMs: number;
  generatedAt: number;
}

export type AgentListener = (ctx: AgentContext) => void;
