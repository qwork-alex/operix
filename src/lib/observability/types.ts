/**
 * Observability — type surface for the runtime health monitor.
 *
 * Passive, in-memory only. No timers, no polling, no network calls of its
 * own. Other modules push samples; consumers (agent, hidden panels) read
 * the snapshot.
 */
export type HealthLevel = "ok" | "degraded" | "down" | "unknown";

export interface RealtimeHealth {
  status: HealthLevel;
  channelsOpen: number;
  reconnects: number;
  lastReconnectAt?: number;
  lastErrorAt?: number;
  lastError?: string;
}

export interface ProviderLatencySample {
  provider: string;
  capability?: string;
  ms: number;
  ok: boolean;
  at: number;
  error?: string;
}

export interface IngestionSample {
  source: string;
  events: number;
  ok: boolean;
  at: number;
  durationMs?: number;
  error?: string;
}

export interface EdgeFunctionFailure {
  fn: string;
  status?: number;
  message: string;
  at: number;
}

export interface JobFailure {
  job: string;
  message: string;
  at: number;
}

export interface ThroughputBucket {
  /** epoch-minute (Math.floor(ms / 60_000)) */
  minute: number;
  count: number;
}

export interface HealthSnapshot {
  realtime: RealtimeHealth;
  providers: Record<string, {
    samples: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    errorRate: number;
    lastAt: number;
    lastOk: boolean;
  }>;
  ingestion: Record<string, {
    lastAt: number;
    lastOk: boolean;
    lastEvents: number;
    totalEvents: number;
    failures: number;
  }>;
  edgeFailures: EdgeFunctionFailure[];
  jobFailures: JobFailure[];
  throughputPerMin: ThroughputBucket[];
  memoryMb?: number;
  uptimeMs: number;
  generatedAt: number;
}
