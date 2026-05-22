/**
 * Notification architecture entry point.
 *
 * Registers all built-in channels (currently SIMULATED — no real sends).
 * Producers should import { notify } and dispatch payloads; channel
 * selection / dedup / rate limit are handled by the registry.
 */
import { NotificationRegistry } from "./NotificationRegistry";
import { WhatsAppChannel } from "./channels/WhatsAppChannel";
import { EmailChannel } from "./channels/EmailChannel";
import { InternalChannel } from "./channels/InternalChannel";

let booted = false;
export function bootNotifications(): void {
  if (booted) return;
  booted = true;
  NotificationRegistry.registerChannel(InternalChannel);
  NotificationRegistry.registerChannel(EmailChannel);
  NotificationRegistry.registerChannel(WhatsAppChannel);
}

// Auto-boot on import — safe because all channels simulate in Phase 1.
bootNotifications();

export { NotificationRegistry } from "./NotificationRegistry";
export { WhatsAppChannel, EmailChannel, InternalChannel };
export * from "./types";

export const notify = NotificationRegistry.notify;
