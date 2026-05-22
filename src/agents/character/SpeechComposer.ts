/**
 * SpeechComposer — produces short, technical lines for the agent.
 *
 * Style guide (strict):
 *   - Portuguese (PT primary), single sentence, < 80 chars
 *   - operator/Jarvis tone: precise, neutral, useful
 *   - never childish, never emoji, never jokes
 *   - no exclamation marks unless severity = critical
 */
import type { CharacterMood, CharacterContext } from "./types";

const CRITICAL: string[] = [
  "Sinal crítico detectado. Recomendo verificação imediata.",
  "Falha grave em curso. Diagnóstico em execução.",
  "Anomalia crítica no runtime. Atenção necessária.",
];

const WARNING: string[] = [
  "Degradação detectada. Monitorando.",
  "Sinal de alerta ativo. Analisando padrão.",
  "Inconsistência operacional observada.",
];

const OBSERVER: string[] = [
  "Ambiente estável. Permaneço em observação.",
  "Sem eventos relevantes. Pronto quando precisar.",
  "Runtime saudável. Em modo de vigilância.",
];

const ANALYZING: string[] = [
  "Correlacionando eventos recentes.",
  "Verificando integridade dos providers.",
  "Compondo hipótese de causa raiz.",
];

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function composeLine(mood: CharacterMood, ctx: CharacterContext, reason: string): string | undefined {
  if (reason === "critical") return pick(CRITICAL);
  if (reason === "warning") return pick(WARNING);
  if (reason === "observer") return pick(OBSERVER);
  if (mood.emotion === "analyzing") return pick(ANALYZING);
  return undefined;
}
