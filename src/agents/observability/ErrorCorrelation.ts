/**
 * ErrorCorrelation — groups runtime/operational errors by signature
 * and detects bursts + recurring patterns.
 *
 * Sources:
 *   - window 'error' / 'unhandledrejection'
 *   - OperationalEventBus events with severity in {error, critical}
 *
 * Signature: normalized message (trim numbers, ids, hex, urls).
 */
import { OperationalEventBus } from "@/lib/operationalBus";
import type { ErrorSignature } from "./types";

const BURST_WINDOW_MS = 60_000;
const BURST_THRESHOLD = 4;
const RECUR_WINDOW_MS = 30 * 60_000;
const RECUR_THRESHOLD = 6;
const MAX_SIGS = 200;

interface Bucket {
  signature: string;
  message: string;
  hits: number[];
  sources: Set<string>;
  sample?: string;
}

function normalize(msg: string): string {
  return msg
    .toLowerCase()
    .replace(/\b[0-9a-f]{8,}\b/gi, "<hex>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/['"`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

class Correlator {
  private started = false;
  private buckets = new Map<string, Bucket>();
  private listeners = new Set<(sigs: ErrorSignature[]) => void>();
  private lastEmit = 0;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;

    window.addEventListener("error", (e: ErrorEvent) => {
      this.record(e.message || "runtime error", "window.error", e.error?.stack?.slice(0, 240));
    });
    window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
      const msg = String(e.reason?.message ?? e.reason ?? "promise rejected");
      this.record(msg, "window.rejection", String(e.reason?.stack ?? "").slice(0, 240));
    });

    OperationalEventBus.subscribe((evt) => {
      if (evt.severity === "error" || evt.severity === "critical") {
        this.record(evt.title, evt.source, evt.detail);
      }
    });
  }

  record(message: string, source: string, sample?: string) {
    const sig = normalize(message) || "unknown";
    const now = Date.now();
    let b = this.buckets.get(sig);
    if (!b) {
      b = { signature: sig, message: message.slice(0, 200), hits: [], sources: new Set() };
      this.buckets.set(sig, b);
      if (this.buckets.size > MAX_SIGS) {
        // evict oldest
        const oldest = [...this.buckets.entries()]
          .sort((a, b) => a[1].hits[0] - b[1].hits[0])[0];
        if (oldest) this.buckets.delete(oldest[0]);
      }
    }
    b.hits.push(now);
    b.sources.add(source);
    if (sample) b.sample = sample;
    // prune old hits
    const cutoff = now - RECUR_WINDOW_MS;
    b.hits = b.hits.filter((t) => t >= cutoff);
    this.emit();
  }

  subscribe(fn: (sigs: ErrorSignature[]) => void): () => void {
    this.listeners.add(fn);
    fn(this.getSignatures());
    return () => this.listeners.delete(fn);
  }

  getSignatures(): ErrorSignature[] {
    const now = Date.now();
    const burstCutoff = now - BURST_WINDOW_MS;
    return [...this.buckets.values()]
      .map((b) => {
        const burstHits = b.hits.filter((t) => t >= burstCutoff).length;
        return {
          signature: b.signature,
          message: b.message,
          count: b.hits.length,
          firstSeenAt: b.hits[0] ?? now,
          lastSeenAt: b.hits[b.hits.length - 1] ?? now,
          sources: [...b.sources],
          burst: burstHits >= BURST_THRESHOLD,
          recurring: b.hits.length >= RECUR_THRESHOLD,
          sample: b.sample,
        } as ErrorSignature;
      })
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  private emit() {
    const now = Date.now();
    if (now - this.lastEmit < 1500) return;
    this.lastEmit = now;
    const s = this.getSignatures();
    this.listeners.forEach((fn) => { try { fn(s); } catch { /* noop */ } });
  }
}

export const ErrorCorrelation = new Correlator();
