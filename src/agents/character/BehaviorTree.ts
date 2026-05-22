/**
 * BehaviorTree — decides discrete, throttled actions the character
 * should take given the current mood + context.
 *
 * Actions are intentionally minimal & non-invasive. We do NOT pop
 * dialogs, do NOT play sounds, do NOT spam toasts. The runtime only
 * surfaces a tiny optional "line" (handled by SpeechComposer) and
 * may request a posture nudge (handled by PresenceEngine indirectly).
 */
import type { CharacterContext, CharacterMood } from "./types";

export type BehaviorAction =
  | { type: "speak"; reason: string }       // suggest a short line
  | { type: "approach" }                    // ask presence to replan closer
  | { type: "withdraw" }                    // ask presence to retreat
  | { type: "blink" }                       // micro-expression tick
  | { type: "idle" };                       // no-op

interface DecideInput {
  ctx: CharacterContext;
  mood: CharacterMood;
  /** ms since last speak action */
  sinceSpeakMs: number;
  /** ms since last approach action */
  sinceApproachMs: number;
}

const SPEAK_COOLDOWN_MS = 25_000;
const APPROACH_COOLDOWN_MS = 8_000;

export function decideBehavior(input: DecideInput): BehaviorAction {
  const { ctx, mood, sinceSpeakMs, sinceApproachMs } = input;

  // Critical: approach & speak once per cooldown
  if (mood.emotion === "alarmed") {
    if (sinceApproachMs > APPROACH_COOLDOWN_MS) return { type: "approach" };
    if (sinceSpeakMs > SPEAK_COOLDOWN_MS) return { type: "speak", reason: "critical" };
  }

  if (mood.emotion === "concerned" && sinceSpeakMs > SPEAK_COOLDOWN_MS * 2) {
    return { type: "speak", reason: "warning" };
  }

  // User focused → keep clear
  if (ctx.userFocused) {
    if (sinceApproachMs > APPROACH_COOLDOWN_MS) return { type: "withdraw" };
  }

  // Deep idle observer
  if (ctx.userDeepIdle && sinceSpeakMs > SPEAK_COOLDOWN_MS * 6) {
    return { type: "speak", reason: "observer" };
  }

  return { type: "blink" };
}
