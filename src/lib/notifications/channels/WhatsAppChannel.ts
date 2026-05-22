/**
 * WhatsAppChannel — Phase 1 SIMULATION.
 *
 * Architecture is ready for a real integration (Twilio WhatsApp or
 * WhatsApp Business via Sinch connector). For now `deliver()` only logs
 * the payload to console + telemetry and returns `simulated`.
 *
 * To go live later:
 *   1. Replace the body of `deliver()` with a call to the Twilio gateway
 *      (see Twilio connector skill) using the agent's notifications number.
 *   2. Switch `isReady()` to verify required secrets exist
 *      (TWILIO_API_KEY + a configured FROM number).
 *   3. Keep the same signature — no producer changes required.
 */
import type {
  NotificationChannel,
  NotificationPayload,
  NotifyDeliveryResult,
} from "../types";

export const WhatsAppChannel: NotificationChannel = {
  key: "whatsapp",
  name: "WhatsApp (simulado)",
  minPriority: "high",                    // WhatsApp reserved for high/critical
  audiences: ["admin", "developer", "owner"],

  isReady() {
    // Phase 1: always "ready" because we don't actually send.
    // Future: return Boolean(secrets.TWILIO_API_KEY && number)
    return true;
  },

  async deliver(payload: NotificationPayload): Promise<NotifyDeliveryResult> {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.info("[notify:whatsapp:SIMULATED]", {
        key: payload.key,
        priority: payload.priority,
        title: payload.title,
        body: payload.body,
        audience: payload.audience,
      });
    }
    return {
      channel: "whatsapp",
      status: "simulated",
      at: Date.now(),
      reason: "phase1_simulation",
    };
  },
};

export default WhatsAppChannel;
