/**
 * RobotAwareness — pointer + contextual attention tracking.
 *
 * Singleton. Two channels feed the robot's gaze:
 *   1. pointer:    where the cursor / touch is right now (passive)
 *   2. attention:  a transient "look-at" target with a TTL, set by the
 *                  app on route / signal changes (active glance)
 *
 * The robot blends both — head tracks the cursor by default, but briefly
 * shifts toward the attention point when one is set, then eases back.
 */
type Vec2 = { x: number; y: number };
type Listener = (v: Vec2) => void;

interface Attention {
  point: Vec2;
  /** When the glance was set, ms since epoch. */
  setAt: number;
  /** How long the glance influences gaze, ms. */
  duration: number;
}

class Awareness {
  private pointer: Vec2 = { x: 0, y: 0 };
  private listeners = new Set<Listener>();
  private bound = false;
  private attention: Attention | null = null;

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

  /**
   * Request a soft attention shift toward `point` (viewport coords) for
   * `duration` ms. Subsequent calls override. Used by the app to nudge
   * the robot toward what changed — e.g. a new banner, a new card.
   */
  glanceAt(point: Vec2, duration = 1400) {
    this.attention = { point, setAt: Date.now(), duration };
  }

  /** Glance toward the center of an element if it exists. */
  glanceAtElement(selector: string, duration = 1400) {
    if (typeof document === "undefined") return;
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    this.glanceAt({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, duration);
  }

  /** Current attention weight (0..1), decays to 0 after duration. */
  private attentionWeight(): number {
    if (!this.attention) return 0;
    const age = Date.now() - this.attention.setAt;
    if (age >= this.attention.duration) return 0;
    // ease-in-out: fast onset, slow release
    const t = age / this.attention.duration;
    return t < 0.25
      ? t / 0.25                          // 0 → 1 in first quarter
      : 1 - (t - 0.25) / 0.75;            // 1 → 0 over remaining
  }

  /**
   * Normalized look vector from `anchor`, clamped to [-1,1] per axis.
   * Blends pointer with the active attention point if one is set.
   */
  lookFrom(anchor: Vec2, range = 240): Vec2 {
    const w = this.attentionWeight();
    const target = w > 0 && this.attention
      ? {
          x: this.pointer.x * (1 - w) + this.attention.point.x * w,
          y: this.pointer.y * (1 - w) + this.attention.point.y * w,
        }
      : this.pointer;
    const dx = (target.x - anchor.x) / range;
    const dy = (target.y - anchor.y) / range;
    return { x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) };
  }
}

export const robotAwareness = new Awareness();
