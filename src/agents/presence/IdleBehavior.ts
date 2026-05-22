/**
 * IdleBehavior — tracks user activity to decide when the presence
 * entity should hide, observe or re-engage.
 */
export type ActivityLevel = "active" | "focused" | "idle" | "deep-idle";

const FOCUS_MS = 1500;   // last input within this → focused
const IDLE_MS = 12_000;  // no input for this long → idle
const DEEP_IDLE_MS = 60_000;

class IdleTracker {
  private lastInput = Date.now();
  private listeners = new Set<(l: ActivityLevel) => void>();
  private lastLevel: ActivityLevel = "active";
  private rafId: number | null = null;
  private started = false;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    const mark = () => { this.lastInput = Date.now(); };
    ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"].forEach((ev) =>
      window.addEventListener(ev, mark, { passive: true }),
    );
    const loop = () => {
      const lvl = this.compute();
      if (lvl !== this.lastLevel) {
        this.lastLevel = lvl;
        this.listeners.forEach((fn) => fn(lvl));
      }
      this.rafId = window.setTimeout(loop, 1000) as unknown as number;
    };
    loop();
  }

  private compute(): ActivityLevel {
    const age = Date.now() - this.lastInput;
    if (age < FOCUS_MS) return "focused";
    if (age < IDLE_MS) return "active";
    if (age < DEEP_IDLE_MS) return "idle";
    return "deep-idle";
  }

  level(): ActivityLevel {
    return this.compute();
  }

  subscribe(fn: (l: ActivityLevel) => void): () => void {
    this.listeners.add(fn);
    fn(this.compute());
    return () => this.listeners.delete(fn);
  }
}

export const idleTracker = new IdleTracker();
