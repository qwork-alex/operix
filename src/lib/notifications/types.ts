/**
 * Notification architecture — shared types.
 *
 * Decoupled, channel-agnostic surface used by AgentRuntime (and any other
 * producer) to broadcast operational notifications. Channels register into
 * a registry and decide whether/how to deliver each message.
 *
 * Phase 1 (current): architecture only. Channels SIMULATE delivery —
 * nothing is sent to WhatsApp, email or push providers. Real integrations
 * plug in later without changing producers.
 */
export type NotifyChannelKey = "whatsapp" | "email" | "internal";

export type NotifyAudience = "admin" | "developer" | "owner" | "ops";

export type NotifyPriority = "low" | "normal" | "high" | "critical";

export interface NotificationPayload {
  /** Stable key for dedup / cooldown. Required. */
  key: string;
  title: string;
  body?: string;
  audience: NotifyAudience[];
  priority: NotifyPriority;
  /** ISO source tag (e.g. "agent", "ingest", "billing"). */
  source: string;
  /** Optional structured metadata for channel templating. */
  metadata?: Record<string, unknown>;
  /** Optional explicit timestamp (defaults to now). */
  occurredAt?: number;
}

export interface NotifyDeliveryResult {
  channel: NotifyChannelKey;
  status: "sent" | "simulated" | "skipped" | "throttled" | "failed";
  at: number;
  reason?: string;
}

export interface NotificationChannel {
  key: NotifyChannelKey;
  name: string;
  /** Lowest priority this channel will accept. */
  minPriority: NotifyPriority;
  /** Audience this channel serves (intersection with payload audience). */
  audiences: NotifyAudience[];
  /** Channel-specific health/readiness probe. */
  isReady(): boolean;
  /** Deliver one message. Phase 1: log + return "simulated". */
  deliver(payload: NotificationPayload): Promise<NotifyDeliveryResult>;
}

export interface NotifyDispatchResult {
  key: string;
  acceptedAt: number;
  deduped: boolean;
  throttled: boolean;
  deliveries: NotifyDeliveryResult[];
}
