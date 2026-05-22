/**
 * EmailChannel — Phase 1 SIMULATION.
 *
 * Will later wire into the project's transactional email infrastructure
 * (Lovable Emails / send-transactional-email Edge Function). For now,
 * `deliver()` logs and returns `simulated`.
 */
import type {
  NotificationChannel,
  NotificationPayload,
  NotifyDeliveryResult,
} from "../types";

export const EmailChannel: NotificationChannel = {
  key: "email",
  name: "Email (simulado)",
  minPriority: "normal",
  audiences: ["admin", "developer", "owner", "ops"],

  isReady() {
    // Phase 1: simulation only.
    // Future: probe email_send_state / domain status before returning true.
    return true;
  },

  async deliver(payload: NotificationPayload): Promise<NotifyDeliveryResult> {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.info("[notify:email:SIMULATED]", {
        key: payload.key,
        priority: payload.priority,
        subject: payload.title,
        body: payload.body,
        audience: payload.audience,
      });
    }
    return {
      channel: "email",
      status: "simulated",
      at: Date.now(),
      reason: "phase1_simulation",
    };
  },
};

export default EmailChannel;
