import type {
  MultimodalAttachment,
  MultimodalAnalysisHint,
  MultimodalAnalysisResult,
  MultimodalProvider,
} from "../types";

/**
 * Stub provider used while no real model is wired.
 * Returns deterministic, technical-sounding heuristics so the rest of the
 * pipeline (UI, correlation, conversation) can be built end-to-end.
 */
export const StubProvider: MultimodalProvider = {
  name: "stub",

  async analyzeImage(
    att: MultimodalAttachment,
    hint?: MultimodalAnalysisHint,
  ): Promise<Partial<MultimodalAnalysisResult>> {
    await tick(120);
    const note = (hint?.userNote ?? "").toLowerCase();
    const findings: MultimodalAnalysisResult["findings"] = [];

    if (note.includes("mapa") || note.includes("map")) {
      findings.push({
        severity: "error",
        title: "Possível falha de render do mapa",
        detail: "Verificar canvas MapLibre e último evento de geolocalização.",
        evidence: ["heurística: nota do usuário menciona mapa"],
      });
    }
    if (note.includes("branc") || note.includes("vazio") || note.includes("sumiu")) {
      findings.push({
        severity: "warning",
        title: "Tela aparentemente vazia",
        detail: "Container provável sem dados ou com fetch pendente.",
      });
    }
    if (!findings.length) {
      findings.push({
        severity: "info",
        title: "Imagem recebida",
        detail: "Sem heurística aplicável no provider stub.",
      });
    }

    return {
      provider: "stub",
      summary: `Imagem ${att.kind} (${Math.round(att.size / 1024)} KB) analisada em modo stub.`,
      findings,
    };
  },

  async transcribeAudio(att: MultimodalAttachment): Promise<Partial<MultimodalAnalysisResult>> {
    await tick(80);
    return {
      provider: "stub",
      transcript: `[stub] Áudio de ${att.durationSec?.toFixed(1) ?? "?"}s recebido.`,
      findings: [
        {
          severity: "info",
          title: "Transcrição pendente",
          detail: "Whisper/Lovable AI ainda não conectado nesta fase.",
        },
      ],
    };
  },

  async ocr(att: MultimodalAttachment) {
    await tick(60);
    return { text: `[stub-ocr] ${att.name}`, confidence: 0 };
  },
};

function tick(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
