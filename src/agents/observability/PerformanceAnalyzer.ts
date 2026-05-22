/**
 * PerformanceAnalyzer — passive monitor for client-side runtime perf.
 *
 * Captures:
 *   - long tasks (PerformanceObserver "longtask")
 *   - cumulative layout shifts (PerformanceObserver "layout-shift")
 *   - frames-per-second (rAF sampling, EMA)
 *   - JS heap (when available)
 *
 * Rolling 60-second window. Pure aggregation, zero polling beyond rAF.
 */
import type { PerfStats } from "./types";

const WINDOW_MS = 60_000;

interface LongTask { at: number; duration: number; }
interface Shift { at: number; value: number; }

class Analyzer {
  private started = false;
  private longTasks: LongTask[] = [];
  private shifts: Shift[] = [];
  private fps = 60;
  private lastFrame = 0;
  private rafId: number | null = null;
  private listeners = new Set<(s: PerfStats) => void>();
  private lastEmit = 0;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    this.observeLongTasks();
    this.observeShifts();
    this.startFpsLoop();
  }

  subscribe(fn: (s: PerfStats) => void): () => void {
    this.listeners.add(fn);
    fn(this.getStats());
    return () => this.listeners.delete(fn);
  }

  getStats(): PerfStats {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    this.longTasks = this.longTasks.filter((t) => t.at >= cutoff);
    this.shifts = this.shifts.filter((s) => s.at >= cutoff);
    const longTaskMs = this.longTasks.reduce((a, t) => a + t.duration, 0);
    const worst = this.longTasks.reduce((a, t) => Math.max(a, t.duration), 0);
    const cls = this.shifts.reduce((a, s) => a + s.value, 0);
    return {
      fps: Math.round(this.fps),
      longTasks: this.longTasks.length,
      longTaskMs: Math.round(longTaskMs),
      worstLongTaskMs: Math.round(worst),
      cls: Math.round(cls * 1000) / 1000,
      jsHeapMb: this.readHeapMb(),
      windowMs: WINDOW_MS,
    };
  }

  private readHeapMb(): number | undefined {
    try {
      const mem = (performance as any)?.memory;
      if (mem?.usedJSHeapSize) return Math.round(mem.usedJSHeapSize / 1048576);
    } catch { /* noop */ }
    return undefined;
  }

  private observeLongTasks() {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTasks.push({ at: Date.now(), duration: entry.duration });
        }
        this.maybeEmit();
      });
      obs.observe({ type: "longtask", buffered: true } as any);
    } catch { /* unsupported */ }
  }

  private observeShifts() {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            this.shifts.push({ at: Date.now(), value: entry.value });
          }
        }
        this.maybeEmit();
      });
      obs.observe({ type: "layout-shift", buffered: true } as any);
    } catch { /* unsupported */ }
  }

  private startFpsLoop() {
    const loop = (t: number) => {
      if (this.lastFrame) {
        const dt = t - this.lastFrame;
        if (dt > 0) {
          const instant = 1000 / dt;
          this.fps = this.fps * 0.92 + instant * 0.08;
        }
      }
      this.lastFrame = t;
      this.maybeEmit();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private maybeEmit() {
    const now = Date.now();
    if (now - this.lastEmit < 2000) return; // throttle to 0.5 Hz
    this.lastEmit = now;
    const s = this.getStats();
    this.listeners.forEach((fn) => { try { fn(s); } catch {/*noop*/} });
  }
}

export const PerformanceAnalyzer = new Analyzer();
