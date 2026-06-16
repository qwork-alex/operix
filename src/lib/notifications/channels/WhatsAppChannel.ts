import type {
  NotificationChannel,
  NotificationPayload,
  NotifyDeliveryResult,
} from "../types";

export const WhatsAppChannel: NotificationChannel = {
  key: "whatsapp",
  name: "WhatsApp",
  minPriority: "high",                    // WhatsApp reserved for high/critical
  audiences: ["admin", "developer", "owner"],

  isReady() {
    return false;
  },

  async deliver(_payload: NotificationPayload): Promise<NotifyDeliveryResult> {
    return {
      channel: "whatsapp",
      status: "skipped",
      at: Date.now(),
      reason: "channel_not_configured",
    };
  },
};

export default WhatsAppChannel;
