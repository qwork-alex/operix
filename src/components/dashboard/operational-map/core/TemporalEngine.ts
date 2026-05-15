/**
 * TemporalEngine — global rAF-driven clock for the operational map.
 *
 * Drives radar playback, hail interpolation and ghost trails from a single
 * source so frames stay in sync. PR1 ships the clock + subscriptions;
 * the timeline UI and per-layer onTick wiring land in PR4/PR6.
 */

export interface TemporalState {
  /** Normalized cursor 0..1 over the active window. */
  t: number;
  /** Absolute epoch ms the cursor maps to. */
  timeMs: number;
  /** Whether autoplay is running. */
  playing: boolean;
  /** Multiplier: 0.5, 1, 2, 4. */
  speed: number;
}

type Listener = (s: TemporalState) => void;

export class TemporalEngine {
  private t0 = Date.now() - 60 * 60 * 1000; // last hour by default
  private t1 = Date.now();
  private cursor = 1;
  private playing = false;
  private speed = 1;
  private rafId: number | null = null;
  private lastFrame = 0;
  private listeners = new Set<Listener>();

  setWindow(t0: number, t1: number) {
    this.t0 = t0; this.t1 = Math.max(t0 + 1, t1);
    this.emit();
  }

  setCursor(t: number) {
    this.cursor = Math.min(1, Math.max(0, t));
    this.emit();
  }

  setSpeed(speed: number) {
    this.speed = Math.max(0.25, Math.min(8, speed));
    this.emit();
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.lastFrame = performance.now();
    const tick = (now: number) => {
      if (!this.playing) return;
      const dt = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      // Default loop length: 30s real time @ 1x for the full window.
      const advance = (dt / 30) * this.speed;
      this.cursor += advance;
      if (this.cursor >= 1) this.cursor = 0;
      this.emit();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.emit();
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  state(): TemporalState {
    return {
      t: this.cursor,
      timeMs: this.t0 + (this.t1 - this.t0) * this.cursor,
      playing: this.playing,
      speed: this.speed,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state());
    return () => { this.listeners.delete(fn); };
  }

  dispose() {
    this.pause();
    this.listeners.clear();
  }

  private emit() {
    const s = this.state();
    this.listeners.forEach((l) => { try { l(s); } catch {} });
  }
}
