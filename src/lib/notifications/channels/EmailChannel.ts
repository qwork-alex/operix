import type {
  NotificationChannel,
  NotificationPayload,
  NotifyDeliveryResult,
} from "../types";
import { apiRequest } from "@/lib/api";

export const EmailChannel: NotificationChannel = {
  key: "email",
  name: "Email",
  minPriority: "normal",
  audiences: ["admin", "developer", "owner", "ops"],

  isReady() {
    return true;
  },

  async deliver(payload: NotificationPayload): Promise<NotifyDeliveryResult> {
    await apiRequest("/account/notifications/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title,
        body: payload.body ?? null,
        source: payload.source,
        priority: payload.priority,
      }),
    });
    return {
      channel: "email",
      status: "sent",
      at: Date.now(),
    };
  },
};

export default EmailChannel;
