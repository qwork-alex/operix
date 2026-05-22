/**
 * RealtimeInspector — websocket/realtime channel watchdog.
 *
 * Wraps RuntimeHealthMonitor + counts realtime events from
 * OperationalEventBus to detect *stalls* (no events for too long
 * while channels are open). Push-only; emits a stat snapshot on
 * change.
 */
import { RuntimeHealthMonitor } from "@/lib/observability";
import { OperationalEventBus } from "@/lib/operationalBus";
import type { RealtimeStats } from "./types";

const STALL_THRESHOLD_MS = 90_000;  // no events for 90s = suspect stall

class Inspector {
  private started = false;
  private lastEventAt = 0;
  private eventsLastMinute = 0;
  private minuteAnchor = 0;
  private listeners = new Set<(s: RealtimeStats) => void>();
  private lastEmit = 0;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    RuntimeHealthMonitor.start();

    OperationalEventBus.subscribe((evt) => {
      // count anything that flowed through the bus as live activity
      this.lastEventAt = evt.occurredAt;
      const minute = Math.floor(evt.occurredAt / 60_000);
      if (minute !== this.minuteAnchor) {
        this.minuteAnchor = minute;
        this.eventsLastMinute = 1;
      } else {
        this.eventsLastMinute += 1;
      }
      this.emit();
    });

    RuntimeHealthMonitor.subscribe(() => this.emit());
  }

  subscribe(fn: (s: RealtimeStats) => void): () => void {
    this.listeners.add(fn);
    fn(this.getStats());
    return () => this.listeners.delete(fn);
  }

  getStats(): RealtimeStats {
    const snap = RuntimeHealthMonitor.getSnapshot();
    const silenceMs = this.lastEventAt ? Date.now() - this.lastEventAt : -1;
    const channelsOpen = snap.realtime.channelsOpen;
    const status = snap.realtime.status;
    const suspectStall =
      channelsOpen > 0 && silenceMs >= 0 && silenceMs > STALL_THRESHOLD_MS;
    return {
      status,
      channelsOpen,
      reconnects: snap.realtime.reconnects,
      eventsLastMinute: this.eventsLastMinute,
      silenceMs,
      suspectStall,
    };
  }

  private emit() {
    const now = Date.now();
    if (now - this.lastEmit < 1500) return;
    this.lastEmit = now;
    const s = this.getStats();
    this.listeners.forEach((fn) => { try { fn(s); } catch { /* noop */ } });
  }
}

export const RealtimeInspector = new Inspector();
