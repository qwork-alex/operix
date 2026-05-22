/**
 * VirtualEngineer — operational copilot type surface.
 *
 * Sits on top of AgentRuntime + RuntimeHealthMonitor + OperationalEventBus
 * and produces *engineering-grade* artifacts:
 *
 *   - RootCauseHypothesis  (why is this happening?)
 *   - FixProposal          (what should we do?)
 *   - IncidentReport       (printable post-mortem)
 *   - EngineerDiagnosis    (full context bundle for UI / LLM)
 *
 * This layer is deterministic. An LLM driver can be plugged in later by
 * consuming `EngineerDiagnosis` as its grounding context.
 */
import type {
  AgentSignal,
  AgentSignalKind,
  AgentUrgency,
} from "@/lib/agent/types";
import type {
  OperationalEvent,
  OpSeverity,
  OpSource,
} from "@/lib/operationalBus/OperationalEventBus";
import type { HealthSnapshot } from "@/lib/observability";

export type FixSeverity = "minor" | "moderate" | "major" | "blocker";
export type FixCategory =
  | "configuration"
  | "deployment"
  | "data"
  | "infrastructure"
  | "external_provider"
  | "code"
  | "observability";

export interface FixProposal {
  id: string;
  title: string;
  rationale: string;            // why this fix targets the root cause
  steps: string[];              // ordered, human-actionable
  category: FixCategory;
  severity: FixSeverity;
  estimatedMinutes?: number;
  requiresHumanApproval: boolean;
  /** Optional internal action key consumers may bind to a button. */
  actionKey?: string;
}

export interface RootCauseHypothesis {
  id: string;
  summary: string;
  confidence: number;           // 0-1
  evidenceEventIds: string[];   // pointers into OperationalEvent.id
  relatedSignalIds: string[];
  reasoning: string[];          // bullet-style explanation of the chain
}

export type IncidentStatus = "observing" | "active" | "mitigated" | "resolved";

export interface IncidentReport {
  id: string;
  generatedAt: number;
  title: string;
  status: IncidentStatus;
  urgency: AgentUrgency;
  summary: string;
  timeline: Array<{
    at: number;
    severity: OpSeverity;
    source: OpSource;
    text: string;
  }>;
  signals: AgentSignal[];
  hypotheses: RootCauseHypothesis[];
  fixes: FixProposal[];
  runtime?: HealthSnapshot | null;
  /** Plain-text rendering ready to copy/paste into chats or tickets. */
  asText: string;
}

export interface EngineerDiagnosis {
  generatedAt: number;
  /** Highest-urgency signal currently observed, if any. */
  primarySignal: AgentSignal | null;
  /** All ranked hypotheses across active signals. */
  hypotheses: RootCauseHypothesis[];
  /** All proposed fixes, ranked by severity. */
  fixes: FixProposal[];
  /** A short, human-readable narrative (one or two paragraphs). */
  narrative: string;
  /** Relevant events sliced from the rolling window. */
  evidence: OperationalEvent[];
  /** Latest health snapshot used as grounding. */
  runtime: HealthSnapshot | null;
}

export type EngineerListener = (diag: EngineerDiagnosis) => void;

/** Internal classification helper kinds (so consumers can branch on cause). */
export type EngineerCauseTag =
  | "external_provider_down"
  | "ingest_stalled"
  | "realtime_link_unstable"
  | "edge_function_unstable"
  | "repeat_logic_failure"
  | "error_burst"
  | "automation_chain_break"
  | "data_inconsistency"
  | "unknown";

export interface CauseMatch {
  tag: EngineerCauseTag;
  signalKind: AgentSignalKind;
}
