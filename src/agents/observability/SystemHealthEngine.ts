/**
 * SystemHealthEngine — aggregates the observability monitors into a
 * single 0..100 health score with explanatory reasons.
 *
 * Subscribers (UI, IncidentGenerator) receive a SystemHealth snapshot
 * whenever any underlying monitor emits.
 */
import { PerformanceAnalyzer } from "./PerformanceAnalyzer";
import { RealtimeInspector } from "./RealtimeInspector";
import { ErrorCorrelation } from "./ErrorCorrelation";
import { RuntimeHealthMonitor } from "@/lib/observability";
import type { ComponentScore, SystemHealth } from "./types";

function gradeFor(score: number): SystemHealth["grade"] {
  if (score >= 85) return "green";
  if (score >= 65) return "yellow";
  if (score >= 40) return "orange";
  return "red";
}

class Engine {
  private started = false;
  private listeners = new Set<(s: SystemHealth) => void>();
  private last: SystemHealth | null = null;
  private lastEmit = 0;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    PerformanceAnalyzer.start();
    RealtimeInspector.start();
    ErrorCorrelation.start();
    RuntimeHealthMonitor.start();

    PerformanceAnalyzer.subscribe(() => this.recompute());
    RealtimeInspector.subscribe(() => this.recompute());
    ErrorCorrelation.subscribe(() => this.recompute());
    RuntimeHealthMonitor.subscribe(() => this.recompute());
    this.recompute();
  }

  subscribe(fn: (s: SystemHealth) => void): () => void {
    this.listeners.add(fn);
    if (this.last) fn(this.last);
    return () => this.listeners.delete(fn);
  }

  current(): SystemHealth { return this.last ?? this.compute(); }

  private recompute() {
    const next = this.compute();
    this.last = next;
    const now = Date.now();
    if (now - this.lastEmit < 1000) return;
    this.lastEmit = now;
    this.listeners.forEach((fn) => { try { fn(next); } catch { /* noop */ } });
  }

  private compute(): SystemHealth {
    const perf = PerformanceAnalyzer.getStats();
    const rt = RealtimeInspector.getStats();
    const sigs = ErrorCorrelation.getSignatures();
    const runtime = RuntimeHealthMonitor.getSnapshot();
    const reasons: string[] = [];

    // ---- performance score
    let perfScore = 1;
    if (perf.fps < 30) { perfScore -= 0.35; reasons.push(`FPS ${perf.fps}`); }
    else if (perf.fps < 45) perfScore -= 0.15;
    if (perf.worstLongTaskMs > 200) { perfScore -= 0.2; reasons.push(`long task ${perf.worstLongTaskMs}ms`); }
    if (perf.cls > 0.25) { perfScore -= 0.15; reasons.push(`CLS ${perf.cls}`); }

    // ---- render score (heap pressure)
    let renderScore = 1;
    if (perf.jsHeapMb && perf.jsHeapMb > 300) {
      renderScore -= 0.25;
      reasons.push(`heap ${perf.jsHeapMb}MB`);
    }

    // ---- realtime / sync
    let rtScore = 1;
    if (rt.status === "down") { rtScore = 0.1; reasons.push("realtime offline"); }
    else if (rt.status === "degraded") { rtScore = 0.55; reasons.push("realtime degradado"); }
    if (rt.suspectStall) { rtScore = Math.min(rtScore, 0.5); reasons.push("realtime sem eventos"); }

    // ---- errors
    let errScore = 1;
    const burst = sigs.find((s) => s.burst);
    const recurring = sigs.find((s) => s.recurring);
    if (burst) { errScore -= 0.45; reasons.push(`burst: ${burst.message.slice(0, 60)}`); }
    if (recurring && recurring.signature !== burst?.signature) {
      errScore -= 0.25; reasons.push(`recorrente: ${recurring.message.slice(0, 60)}`);
    }

    // ---- API / edge
    let apiScore = 1;
    if (runtime.edgeFailures.length > 0) {
      const recent = runtime.edgeFailures.filter((f) => Date.now() - f.at < 5 * 60_000).length;
      if (recent >= 3) { apiScore -= 0.4; reasons.push(`${recent} edge failures`); }
      else if (recent >= 1) apiScore -= 0.15;
    }
    const slowProvider = Object.entries(runtime.providers).find(
      ([, p]) => p.errorRate > 0.3 || p.p95LatencyMs > 3000,
    );
    if (slowProvider) {
      apiScore -= 0.2;
      reasons.push(`provider ${slowProvider[0]} lento`);
    }

    // ---- sync (jobs / ingestion)
    let syncScore = 1;
    const staleIngest = Object.entries(runtime.ingestion).find(
      ([, i]) => i.lastAt > 0 && Date.now() - i.lastAt > 30 * 60_000,
    );
    if (staleIngest) { syncScore -= 0.3; reasons.push(`ingest "${staleIngest[0]}" parado`); }

    // ---- automations
    let autoScore = 1;
    if (runtime.jobFailures.length > 0) {
      const recent = runtime.jobFailures.filter((f) => Date.now() - f.at < 30 * 60_000).length;
      if (recent >= 2) { autoScore -= 0.3; reasons.push(`${recent} automations falharam`); }
    }

    const components: ComponentScore[] = [
      { key: "errors",      label: "Erros",        score: clamp(errScore),    weight: 0.25 },
      { key: "realtime",    label: "Realtime",     score: clamp(rtScore),     weight: 0.20 },
      { key: "api",         label: "APIs/Edge",    score: clamp(apiScore),    weight: 0.20 },
      { key: "performance", label: "Performance",  score: clamp(perfScore),   weight: 0.15 },
      { key: "render",      label: "Render",       score: clamp(renderScore), weight: 0.05 },
      { key: "sync",        label: "Sync/Ingest",  score: clamp(syncScore),   weight: 0.10 },
      { key: "automations", label: "Automações",   score: clamp(autoScore),   weight: 0.05 },
    ];

    const weighted = components.reduce((a, c) => a + c.score * c.weight, 0);
    const score = Math.round(weighted * 100);

    return {
      score,
      grade: gradeFor(score),
      components,
      reasons: reasons.slice(0, 5),
      generatedAt: Date.now(),
    };
  }
}

function clamp(n: number): number { return Math.max(0, Math.min(1, n)); }

export const SystemHealthEngine = new Engine();
