/**
 * RobotSpeechEngine — derives transient "speech" pulses from agent
 * events. When a conversation message arrives, it pulses the global
 * AI 'speaking' flag which the visual layer reflects (mouth/eye sync).
 */
import { globalAI } from "@/agents/ai/GlobalAIState";

export function pulseSpeaking(ms = 1400) {
  globalAI.pulse("speaking", ms);
}

export function pulseThinking(ms = 1800) {
  globalAI.pulse("thinking", ms);
}
