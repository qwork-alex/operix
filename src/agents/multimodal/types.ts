// Phase 12 — Multimodal Intelligence types
export type MultimodalKind = "image" | "screenshot" | "audio" | "text";

export type MultimodalSource =
  | "upload"
  | "drag-drop"
  | "paste"
  | "screenshot"
  | "recording";

export interface MultimodalAttachment {
  id: string;
  kind: MultimodalKind;
  source: MultimodalSource;
  name: string;
  mime: string;
  size: number;
  /** Object URL for preview. Caller is responsible for revoking via dispose(). */
  previewUrl?: string;
  /** Raw blob/file kept in memory for downstream pipelines. */
  blob: Blob;
  /** Duration in seconds (audio only). */
  durationSec?: number;
  createdAt: number;
  meta?: Record<string, unknown>;
}

export interface MultimodalAnalysisHint {
  /** Free-form user note attached to the asset (e.g. "o mapa sumiu"). */
  userNote?: string;
  /** Route/section where the asset was captured. */
  route?: string;
  /** Viewport snapshot. */
  viewport?: { w: number; h: number; dpr: number };
}

export type AnalysisStatus = "idle" | "queued" | "running" | "done" | "error";

export interface AnalysisFinding {
  severity: "info" | "warning" | "error" | "critical";
  title: string;
  detail?: string;
  evidence?: string[];
}

export interface MultimodalAnalysisResult {
  attachmentId: string;
  status: AnalysisStatus;
  startedAt: number;
  finishedAt?: number;
  summary?: string;
  findings: AnalysisFinding[];
  /** OCR text (if applicable). */
  ocrText?: string;
  /** Transcription text (if applicable). */
  transcript?: string;
  /** Correlated operational signals (filled by orchestrator). */
  correlations?: Array<{ key: string; label: string; detail?: string }>;
  /** Provider used. `"stub"` while no real provider is wired. */
  provider: "stub" | "lovable-ai" | "whisper" | string;
  error?: string;
}

export interface MultimodalProvider {
  readonly name: string;
  analyzeImage?(
    att: MultimodalAttachment,
    hint?: MultimodalAnalysisHint,
  ): Promise<Partial<MultimodalAnalysisResult>>;
  transcribeAudio?(
    att: MultimodalAttachment,
    hint?: MultimodalAnalysisHint,
  ): Promise<Partial<MultimodalAnalysisResult>>;
  ocr?(
    att: MultimodalAttachment,
  ): Promise<{ text: string; confidence?: number }>;
}
