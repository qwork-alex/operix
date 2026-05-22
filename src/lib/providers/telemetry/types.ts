import type { BaseProvider } from "../registry";

export type TelemetryCapability = "metrics" | "logs" | "traces" | "events";

export interface TelemetryEvent {
  name: string;
  level?: "info" | "warn" | "error";
  detail?: string;
  context?: Record<string, unknown>;
  ts?: number;
}

export interface TelemetryProvider extends BaseProvider {
  capabilities: TelemetryCapability[];
  emit?(evt: TelemetryEvent): void | Promise<void>;
}
