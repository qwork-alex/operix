/**
 * NotificationProviderRegistry — central dispatcher for operational
 * notifications across pluggable channels (WhatsApp, email, internal…).
 *
 * Producers (AgentRuntime, billing, ingest…) call `notify(payload)`. The
 * registry:
 *  - applies dedup (same key within DEDUP_WINDOW_MS is dropped)
 *  - applies per-key cooldown (re-emits allowed only after COOLDOWN_MS)
 *  - applies a global token-bucket rate limit (avoids alert storms)
 *  - filters channels by priority + audience
 *  - delegates delivery to each matching channel
 *
 * Phase 1: all channels SIMULATE delivery. No external messages are sent.
 * Real WhatsApp / email integrations swap in by replacing each channel's
 * `deliver()` implementation — no producer needs to change.
 */
import type {
  NotificationChannel,
  NotificationPayload,
  NotifyChannelKey,
  NotifyDeliveryResult,
  NotifyDispatchResult,
  NotifyPriority,
} from "./types";

const DEDUP_WINDOW_MS = 5 * 60 * 1000;      // hard dedup
const COOLDOWN_MS = 15 * 60 * 1000;          // same key re-allowed after this
const RATE_LIMIT_PER_MIN = 30;               // global cap to prevent storms

const PRIORITY_RANK: Record<NotifyPriority, number> = {
  low: 0, normal: 1, high: 2, critical: 3,
};

const channels = new Map<NotifyChannelKey, NotificationChannel>();
const lastSeen = new Map<string, number>();      // key -> last emit ts
const recentSends: number[] = [];                 // rolling window of emit ts
const auditTrail: NotifyDispatchResult[] = [];    // bounded local audit
const AUDIT_MAX = 200;

/* -------------------------------------------------------- registry ---- */

export function registerChannel(channel: NotificationChannel): void {
  channels.set(channel.key, channel);
}

export function unregisterChannel(key: NotifyChannelKey): void {
  channels.delete(key);
}

export function getChannel(key: NotifyChannelKey): NotificationChannel | undefined {
  return channels.get(key);
}

export function listChannels(): NotificationChannel[] {
  return [...channels.values()];
}

/* -------------------------------------------------------- dispatch ---- */

export async function notify(payload: NotificationPayload): Promise<NotifyDispatchResult> {
  const now = payload.occurredAt ?? Date.now();
  const result: NotifyDispatchResult = {
    key: payload.key,
    acceptedAt: now,
    deduped: false,
    throttled: false,
    deliveries: [],
  };

  // Dedup / cooldown
  const last = lastSeen.get(payload.key);
  if (last) {
    const age = now - last;
    if (age < DEDUP_WINDOW_MS) {
      result.deduped = true;
      pushAudit(result);
      return result;
    }
    // High/critical bypass the long cooldown; normal/low must wait it out.
    const rank = PRIORITY_RANK[payload.priority];
    if (rank < PRIORITY_RANK.high && age < COOLDOWN_MS) {
      result.throttled = true;
      pushAudit(result);
      return result;
    }
  }

  // Global rate limit (token bucket / sliding window)
  pruneRateWindow(now);
  if (recentSends.length >= RATE_LIMIT_PER_MIN) {
    result.throttled = true;
    pushAudit(result);
    return result;
  }

  lastSeen.set(payload.key, now);
  recentSends.push(now);

  // Fan out to eligible channels
  const eligible = listChannels().filter((c) => isEligible(c, payload));
  for (const ch of eligible) {
    if (!ch.isReady()) {
      result.deliveries.push({
        channel: ch.key, status: "skipped", at: now, reason: "channel_not_ready",
      });
      continue;
    }
    try {
      const r = await ch.deliver(payload);
      result.deliveries.push(r);
    } catch (e: any) {
      result.deliveries.push({
        channel: ch.key, status: "failed", at: Date.now(),
        reason: e?.message ?? "deliver_threw",
      });
    }
  }

  pushAudit(result);
  return result;
}

export function getAudit(): NotifyDispatchResult[] {
  return [...auditTrail];
}

export function reset(): void {
  channels.clear();
  lastSeen.clear();
  recentSends.length = 0;
  auditTrail.length = 0;
}

/* -------------------------------------------------------- internals -- */

function isEligible(ch: NotificationChannel, p: NotificationPayload): boolean {
  if (PRIORITY_RANK[p.priority] < PRIORITY_RANK[ch.minPriority]) return false;
  return p.audience.some((a) => ch.audiences.includes(a));
}

function pruneRateWindow(now: number) {
  const cutoff = now - 60_000;
  while (recentSends.length && recentSends[0] < cutoff) recentSends.shift();
}

function pushAudit(r: NotifyDispatchResult) {
  auditTrail.push(r);
  if (auditTrail.length > AUDIT_MAX) {
    auditTrail.splice(0, auditTrail.length - AUDIT_MAX);
  }
}

export const NotificationRegistry = {
  registerChannel, unregisterChannel, getChannel, listChannels,
  notify, getAudit, reset,
};

export default NotificationRegistry;
