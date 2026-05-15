/**
 * PerfMonitor — lightweight runtime telemetry for the operational map.
 *
 * Tracks:
 *  - FPS (rolling 1s average via rAF)
 *  - JS heap (when chrome exposes performance.memory)
 *  - Layer mount count (incremented by LayerRegistry)
 *  - Tile request rate hint (incremented by callers)
 *
 * Stub-grade in PR1: the FPS clock is real, the rest exposes setters that the
 * later PRs (LayerRegistry, tile pipeline) will plug into.
 */

export interface PerfSnapshot {
  fps: number;
  jsHeapMb: number | null;
  layers: number;
  tilesInFlight: number;
}

type Listener = (s: PerfSnapshot) => void;

class PerfMonitorImpl {
  private fps = 0;
  private layers = 0;
  private tilesInFlight = 0;
  private listeners = new Set<Listener>();
  private rafId: number | null = null;
  private frameCount = 0;
  private lastSampleAt = 0;

  start() {
    if (this.rafId != null) return;
    this.lastSampleAt = performance.now();
    const tick = (now: number) => {
      this.frameCount++;
      const delta = now - this.lastSampleAt;
      if (delta >= 1000) {
        this.fps = Math.round((this.frameCount * 1000) / delta);
        this.frameCount = 0;
        this.lastSampleAt = now;
        this.emit();
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  setLayers(n: number) { this.layers = n; this.emit(); }
  incTiles() { this.tilesInFlight++; }
  decTiles() { this.tilesInFlight = Math.max(0, this.tilesInFlight - 1); }

  snapshot(): PerfSnapshot {
    const mem = (performance as any).memory?.usedJSHeapSize;
    return {
      fps: this.fps,
      jsHeapMb: typeof mem === "number" ? Math.round(mem / 1048576) : null,
      layers: this.layers,
      tilesInFlight: this.tilesInFlight,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => { this.listeners.delete(fn); };
  }

  private emit() {
    const s = this.snapshot();
    this.listeners.forEach((l) => { try { l(s); } catch {} });
  }
}

export const PerfMonitor = new PerfMonitorImpl();
