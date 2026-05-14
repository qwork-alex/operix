// Country Module contract — every jurisdiction implements this.
// Pipeline: input → detector → router → provider → parser → confidence → normalization → UI
// Each module is fully isolated. No global resolver. No shared mutable state.
import type { NormalizedCompany, DocumentKind, ProviderLog } from "../core.ts";

export interface CountryCtx {
  query: string;
  detected_kind: DocumentKind | string;
  country: string;          // ISO-2
  logs: ProviderLog[];
  session_id: string;
}

export interface CountryDetection {
  kind: string;             // e.g. "nif_es", "uid_ch" — country-scoped kinds allowed
  country: string;          // ISO-2
  score: number;            // 0..1 structural confidence
  reasons: string[];
}

export interface CountryModule {
  iso2: string;
  name: string;
  /** Returns local detections (may be empty). Pure function — no I/O. */
  detect(raw: string): CountryDetection[];
  /** Network lookup. MUST receive the request-scoped Ctx. Returns null when nothing usable. */
  lookup(ctx: CountryCtx): Promise<NormalizedCompany | null>;
}
