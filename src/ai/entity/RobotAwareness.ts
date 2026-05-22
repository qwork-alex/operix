/**
 * RobotAwareness — tracks the pointer in viewport space so the
 * robot's head/eyes can follow the user organically.
 *
 * Singleton observer. Subscribes once to mousemove + touchmove and
 * exposes the latest normalized vector relative to a given anchor.
 */
type Vec2 = { x: number; y: number };
type Listener = (v: Vec2) => void;

class Awareness {
  private pointer: Vec2 = { x: 0, y: 0 };
  private listeners = new Set<Listener>();
  private bound = false;

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

  /** Normalized look vector from `anchor`, clamped to [-1,1] per axis. */
  lookFrom(anchor: Vec2, range = 240): Vec2 {
    const dx = (this.pointer.x - anchor.x) / range;
    const dy = (this.pointer.y - anchor.y) / range;
    return { x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) };
  }
}

export const robotAwareness = new Awareness();
