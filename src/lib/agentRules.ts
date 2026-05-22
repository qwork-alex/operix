/**
 * Local Intelligence Layer — rule-based operational reasoning.
 *
 * No LLM, no API calls. Pure if/else over the current signals + context.
 * Produces SUGGESTIONS (chips the user can act on) and short conversational
 * replies for free-text input. This is the placeholder logic the real
 * orchestrator will replace in a later phase.
 */
import type { OperationalSignal } from "@/hooks/useOperationalSignals";
import type { AgentAction } from "./agentActions";

export interface AgentSuggestion {
  id: string;
  label: string;
  action: AgentAction;
  tone?: "default" | "warn" | "error";
}

export function deriveSuggestions(
  signals: OperationalSignal[],
  pathname: string,
): AgentSuggestion[] {
  const out: AgentSuggestion[] = [];

  for (const s of signals) {
    if (s.id === "radar-stale" || s.id === "radar-empty") {
      out.push({
        id: `sug-${s.id}`,
        label: "Abrir Radar PDR",
        tone: s.level === "warn" ? "warn" : "default",
        action: { kind: "navigate", to: "/", focus: "operational-map" },
      });
    }
    if (s.id === "platforms-degraded") {
      out.push({
        id: `sug-${s.id}`,
        label: "Rever plataformas degradadas",
        tone: "warn",
        action: { kind: "navigate", to: "/", focus: "platforms-panel" },
      });
    }
    if (s.id === "runtime-errors") {
      out.push({
        id: `sug-${s.id}`,
        label: "Mostrar últimos erros",
        tone: "error",
        action: { kind: "show_errors" },
      });
    }
  }

  // Contextual nudges
  if (pathname === "/" && !out.length) {
    out.push({
      id: "sug-events",
      label: "Ver fluxo operacional",
      action: { kind: "navigate", to: "/", focus: "operational-events" },
    });
  }
  if (pathname.startsWith("/service-orders")) {
    out.push({
      id: "sug-so-prod",
      label: "Abrir produção",
      action: { kind: "navigate", to: "/production" },
    });
  }

  return out.slice(0, 4);
}

/**
 * Tiny rule-based responder for free-text user input.
 * Real NLU comes later — this just keeps the loop conversational.
 */
export function localReply(input: string, signals: OperationalSignal[]): string {
  const text = input.toLowerCase().trim();
  const worst = signals.find((s) => s.level === "error" || s.level === "warn");

  if (/radar|hail|granizo|pdr/.test(text)) {
    const stale = signals.find((s) => s.id === "radar-stale" || s.id === "radar-empty");
    return stale ? `Radar: ${stale.title.toLowerCase()}.` : "Radar PDR estável.";
  }
  if (/erro|error|falha|bug/.test(text)) {
    const err = signals.find((s) => s.level === "error");
    return err ? `Encontrei: ${err.title}.` : "Sem erros registados nesta sessão.";
  }
  if (/plataforma|platform/.test(text)) {
    const deg = signals.find((s) => s.id === "platforms-degraded");
    return deg ? `Atenção: ${deg.title}.` : "Todas as plataformas operacionais.";
  }
  if (/status|tudo bem|ok|estado/.test(text)) {
    return worst ? `Estado actual: ${worst.title}.` : "Todos os sistemas operacionais.";
  }
  if (/ajuda|help/.test(text)) {
    return "Posso navegar pelos módulos, destacar erros e resumir o estado operacional. Acções reais chegam na próxima fase.";
  }
  return worst
    ? `Recebi. Estou a observar — sinal mais relevante agora: ${worst.title}.`
    : "Recebi. Sistema operacional estável neste momento.";
}
