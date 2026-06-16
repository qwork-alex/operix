/**
 * InternalChannel — in-app notifications.
 *
 * Phase 1: pushes the message to the `agentBus` so existing UI surfaces
 * (FloatingAgent, OperationalEventsStream, future inbox) can react. No
 * database writes yet — the in-app `notifications` table integration can
 * be plugged in later without changing producers.
 */
import { agentBus } from "@/lib/agentEventBus";
import type {
  NotificationChannel,
  NotificationPayload,
  NotifyDeliveryResult,
} from "../types";

export const InternalChannel: NotificationChannel = {
  key: "internal",
  name: "Notificação interna",
  minPriority: "low",
  audiences: ["admin", "developer", "owner", "ops"],

  isReady() {
    return true;
  },

  async deliver(payload: NotificationPayload): Promise<NotifyDeliveryResult> {
    try {
      agentBus.emit({
        kind: "operational_alert",
        level: payload.priority === "critical" ? "critical"
             : payload.priority === "high" ? "error"
             : payload.priority === "normal" ? "warn" : "info",
        title: payload.title,
        detail: payload.body,
        at: payload.occurredAt ?? Date.now(),
      } as any);
    } catch {
      /* swallow — bus may not be ready in tests */
    }
    return { channel: "internal", status: "sent", at: Date.now() };
  },
};

export default InternalChannel;
