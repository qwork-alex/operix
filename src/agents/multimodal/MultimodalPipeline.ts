import type {
  MultimodalAttachment,
  MultimodalAnalysisHint,
  MultimodalAnalysisResult,
  MultimodalProvider,
  AnalysisFinding,
} from "./types";
import { StubProvider } from "./providers/StubProvider";

type Listener = (results: MultimodalAnalysisResult[]) => void;

class MultimodalPipelineImpl {
  private results = new Map<string, MultimodalAnalysisResult>();
  private listeners = new Set<Listener>();
  private provider: MultimodalProvider = StubProvider;

  setProvider(p: MultimodalProvider) {
    this.provider = p;
  }

  getProvider(): MultimodalProvider {
    return this.provider;
  }

  list(): MultimodalAnalysisResult[] {
    return Array.from(this.results.values()).sort((a, b) => b.startedAt - a.startedAt);
  }

  get(id: string): MultimodalAnalysisResult | undefined {
    return this.results.get(id);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.list());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    const snap = this.list();
    this.listeners.forEach((l) => {
      try {
        l(snap);
      } catch {
        /* ignore */
      }
    });
  }

  private upsert(r: MultimodalAnalysisResult) {
    this.results.set(r.attachmentId, r);
    this.emit();
  }

  async analyze(
    att: MultimodalAttachment,
    hint?: MultimodalAnalysisHint,
  ): Promise<MultimodalAnalysisResult> {
    const base: MultimodalAnalysisResult = {
      attachmentId: att.id,
      status: "running",
      startedAt: Date.now(),
      findings: [],
      provider: this.provider.name,
    };
    this.upsert(base);

    try {
      let partial: Partial<MultimodalAnalysisResult> = {};
      if (att.kind === "image" || att.kind === "screenshot") {
        partial = (await this.provider.analyzeImage?.(att, hint)) ?? {};
      } else if (att.kind === "audio") {
        partial = (await this.provider.transcribeAudio?.(att, hint)) ?? {};
      }

      const correlations = await this.correlate(partial.findings ?? [], hint);

      const done: MultimodalAnalysisResult = {
        ...base,
        ...partial,
        status: "done",
        finishedAt: Date.now(),
        correlations,
        provider: partial.provider ?? this.provider.name,
        findings: partial.findings ?? [],
      };
      this.upsert(done);
      return done;
    } catch (e) {
      const failed: MultimodalAnalysisResult = {
        ...base,
        status: "error",
        finishedAt: Date.now(),
        error: e instanceof Error ? e.message : String(e),
      };
      this.upsert(failed);
      return failed;
    }
  }

  /**
   * Correlate findings with observability signals when available.
   * Soft-imports to avoid hard coupling.
   */
  private async correlate(
    findings: AnalysisFinding[],
    _hint?: MultimodalAnalysisHint,
  ): Promise<MultimodalAnalysisResult["correlations"]> {
    if (!findings.length) return [];
    try {
      const mod = await import("@/agents/observability");
      const engine = (mod as unknown as { SystemHealthEngine?: { getSnapshot?: () => unknown } })
        .SystemHealthEngine;
      const snap = engine?.getSnapshot?.() as
        | { score?: number; reasons?: string[] }
        | undefined;
      if (!snap) return [];
      return [
        {
          key: "health",
          label: `Health score atual: ${snap.score ?? "?"}`,
          detail: snap.reasons?.slice(0, 2).join(" · "),
        },
      ];
    } catch {
      return [];
    }
  }

  clear() {
    this.results.clear();
    this.emit();
  }
}

export const MultimodalPipeline = new MultimodalPipelineImpl();
