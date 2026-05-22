/**
 * Live Observability — shared type surface.
 *
 * All monitors push compact, in-memory samples. Consumers receive
 * normalized SystemHealth snapshots and Incident objects.
 *
 * No timers, no polling, no fetch. Pure aggregation.
 */
import type { OperationalEvent } from "@/lib/operationalBus/OperationalEventBus";
import type { HealthSnapshot } from "@/lib/observability";

export type HealthGrade = "green" | "yellow" | "orange" | "red";

export interface ComponentScore {
  key: "errors" | "realtime" | "api" | "performance" | "sync" | "automations" | "render";
  label: string;
  /** 0..1 — 1 is perfect health */
  score: number;
  weight: number;
  detail?: string;
}

export interface SystemHealth {
  /** 0..100 aggregate. 100 = perfect. */
  score: number;
  grade: HealthGrade;
  components: ComponentScore[];
  /** Top reasons score dropped — short, technical. */
  reasons: string[];
  generatedAt: number;
}

export interface PerfStats {
  fps: number;
  longTasks: number;             // count in window
  longTaskMs: number;            // total ms in window
  worstLongTaskMs: number;
  cls: number;                   // cumulative layout shift in window
  jsHeapMb?: number;
  windowMs: number;
}

export interface ErrorSignature {
  signature: string;             // normalized fingerprint
  message: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  sources: string[];             // event sources seen
  burst: boolean;                // many in a short window
  recurring: boolean;            // many over a long window
  sample?: string;               // last raw detail
}

export interface RealtimeStats {
  status: "ok" | "degraded" | "down" | "unknown";
  channelsOpen: number;
  reconnects: number;
  eventsLastMinute: number;
  /** ms since last realtime event; -1 if never */
  silenceMs: number;
  suspectStall: boolean;
}

export type IncidentKind =
  | "error_burst"
  | "perf_degradation"
  | "realtime_stall"
  | "api_failure"
  | "automation_failure"
  | "system_unhealthy";

export type IncidentStatus = "open" | "mitigated" | "resolved";

export interface Incident {
  id: string;
  kind: IncidentKind;
  status: IncidentStatus;
  urgency: "low" | "normal" | "high" | "critical";
  title: string;
  detail?: string;
  openedAt: number;
  closedAt?: number;
  correlationKey: string;
  /** ordered most-recent-last */
  timeline: Array<{ at: number; severity: string; source: string; text: string }>;
  /** snapshot of health at opening */
  healthAtOpen: SystemHealth;
  /** subset of relevant operational events */
  evidence: OperationalEvent[];
  /** snapshot of underlying runtime monitor */
  runtime: HealthSnapshot | null;
  /** plain-text rendering ready for ticket/chat */
  asText: string;
}
