/**
 * Operational Event Bus — decoupled, zero-dependency pub/sub for the AI Agent shell.
 *
 * Purpose (Phase 1): provide a stable foundation for future operational events
 * (runtime errors, extraction failures, sync issues, AI recommendations, alerts)
 * WITHOUT touching the existing runtime, providers, or realtime channels.
 *
 * - No React imports here (safe to use from anywhere, including error handlers).
 * - In-memory only. Capped buffer to avoid leaks.
 * - Subscribers are weakly managed via explicit unsubscribe.
 */

export type AgentEventLevel = "info" | "success" | "warn" | "error";

export type AgentEventKind =
  | "runtime_error"
  | "extraction_failure"
  | "sync_failure"
  | "ai_recommendation"
  | "operational_alert"
  | "user_message"
  | "agent_message"
  | "context_change";

export interface AgentEvent {
  id: string;
  kind: AgentEventKind;
  level: AgentEventLevel;
  title: string;
  detail?: string;
  meta?: Record<string, unknown>;
  at: number;
}

type Listener = (event: AgentEvent) => void;

const MAX_BUFFER = 200;
const buffer: AgentEvent[] = [];
const listeners = new Set<Listener>();

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const agentBus = {
  emit(partial: Omit<AgentEvent, "id" | "at"> & { at?: number }) {
    const evt: AgentEvent = {
      id: uid(),
      at: partial.at ?? Date.now(),
      ...partial,
    };
    buffer.push(evt);
    if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
    listeners.forEach((l) => {
      try {
        l(evt);
      } catch {
        /* swallow — bus must never break callers */
      }
    });
    return evt;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  snapshot(): AgentEvent[] {
    return buffer.slice();
  },
  clear() {
    buffer.length = 0;
  },
};
