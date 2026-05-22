/**
 * RobotAwareness — pointer + contextual attention + guidance tracking.
 *
 * Three channels feed the robot's gaze (weakest → strongest):
 *   1. pointer    — passive cursor follow
 *   2. attention  — short transient glance (route change, new banner)
 *   3. guidance   — stronger sustained pin used for operational guidance
 *                   (anomaly, user confusion). While guidance is active,
 *                   the robot points its arm toward the target as well.
 *
 * Guidance is intentionally rare — only emitted by AIProvider on real
 * operational events. The robot otherwise tracks the cursor calmly.
 */
type Vec2 = { x: number; y: number };
type Listener = (v: Vec2) => void;

interface Attention {
  point: Vec2;
  setAt: number;
  duration: number;
}

interface Guidance {
  point: Vec2;
  setAt: number;
  duration: number;
  reason: string;
}

class Awareness {
  private pointer: Vec2 = { x: 0, y: 0 };
  private listeners = new Set<Listener>();
  private bound = false;
  private attention: Attention | null = null;
  private guidance: Guidance | null = null;

  private bind() {
    if (this.bound || typeof window === "undefined") return;
    this.bound = true;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const p = "touches" in e ? e.touches[0] : (e as MouseEvent);
      if (!p) return;
      this.pointer = { x: (p as MouseEvent).clientX, y: (p as MouseEvent).clientY };
      this.listeners.forEach((l) => l(this.pointer));
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
  }

  subscribe(fn: Listener): () => void {
    this.bind();
    this.listeners.add(fn);
    fn(this.pointer);
    return () => { this.listeners.delete(fn); };
  }

  /** Soft transient gaze nudge — pointer remains dominant. */
  glanceAt(point: Vec2, duration = 1400) {
    this.attention = { point, setAt: Date.now(), duration };
  }

  glanceAtElement(selector: string, duration = 1400) {
    if (typeof document === "undefined") return;
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    this.glanceAt({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, duration);
  }

  /**
   * Operational guidance — strong sustained gaze toward `point` for
   * `duration` ms. Overrides pointer entirely (except for a tiny lead
   * blend) and triggers the arm-pointing posture via `isGuiding()`.
   * Use sparingly: anomalies, confusion states, critical events only.
   */
  guideTo(point: Vec2, duration = 4500, reason = "operational") {
    this.guidance = { point, setAt: Date.now(), duration, reason };
    // also seed the lighter attention channel so the head starts moving
    // before the guidance ramp completes
    this.glanceAt(point, Math.min(1800, duration));
  }

  guideToElement(selector: string, duration = 4500, reason = "operational"): boolean {
    if (typeof document === "undefined") return false;
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    this.guideTo({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, duration, reason);
    return true;
  }

  /** True while a guidance gesture is in effect — used by the entity to raise its arm. */
  isGuiding(): boolean {
    return this.guidanceWeight() > 0.05;
  }

  /** Current guidance target (viewport coords) or null. */
  guidanceTarget(): Vec2 | null {
    return this.guidanceWeight() > 0 && this.guidance ? this.guidance.point : null;
  }

  private guidanceWeight(): number {
    if (!this.guidance) return 0;
    const age = Date.now() - this.guidance.setAt;
    if (age >= this.guidance.duration) return 0;
    const t = age / this.guidance.duration;
    // sustained: ramps in fast, stays ~0.92, eases out at the tail
    if (t < 0.15) return (t / 0.15) * 0.92;
    if (t < 0.75) return 0.92;
    return 0.92 * (1 - (t - 0.75) / 0.25);
  }

  private attentionWeight(): number {
    if (!this.attention) return 0;
    const age = Date.now() - this.attention.setAt;
    if (age >= this.attention.duration) return 0;
    const t = age / this.attention.duration;
    return t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
  }

  /**
   * Normalized look vector from `anchor`, clamped to [-1,1] per axis.
   * Blends pointer ⟵ attention ⟵ guidance in order of strength.
   */
  lookFrom(anchor: Vec2, range = 240): Vec2 {
    const gw = this.guidanceWeight();
    const aw = this.attentionWeight();
    let target = this.pointer;
    if (aw > 0 && this.attention) {
      target = {
        x: this.pointer.x * (1 - aw) + this.attention.point.x * aw,
        y: this.pointer.y * (1 - aw) + this.attention.point.y * aw,
      };
    }
    if (gw > 0 && this.guidance) {
      target = {
        x: target.x * (1 - gw) + this.guidance.point.x * gw,
        y: target.y * (1 - gw) + this.guidance.point.y * gw,
      };
    }
    const dx = (target.x - anchor.x) / range;
    const dy = (target.y - anchor.y) / range;
    return { x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) };
  }
}

export const robotAwareness = new Awareness();
