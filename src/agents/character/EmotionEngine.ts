/**
 * EmotionEngine — maps an operational+activity context to a
 * CharacterMood. Pure function, deterministic, no side effects.
 *
 * Design rules (Jarvis-tier):
 *   - never childish, never playful colors
 *   - critical states dominate everything
 *   - user-focused state always reduces presence
 *   - mood transitions are coarse (8 emotions) but visuals are nuanced
 */
import type { CharacterContext, CharacterMood, Emotion, EyeState, MicroExpression, Posture } from "./types";

const HUE = {
  calm:       { h: "210 90% 60%",  a: "200 70% 45%" },
  attentive:  { h: "195 95% 60%",  a: "210 80% 45%" },
  focused:    { h: "212 60% 50%",  a: "212 50% 35%" },
  concerned:  { h: "38 95% 58%",   a: "28 85% 45%" },
  alarmed:    { h: "0 95% 60%",    a: "0 85% 45%" },
  analyzing:  { h: "268 85% 65%",  a: "260 70% 50%" },
  satisfied:  { h: "152 70% 55%",  a: "152 60% 40%" },
  dormant:    { h: "215 35% 38%",  a: "215 25% 28%" },
} satisfies Record<Emotion, { h: string; a: string }>;

function pickEmotion(ctx: CharacterContext): Emotion {
  if (ctx.hasAlert && ctx.urgency === "critical") return "alarmed";
  if (ctx.hasAlert && ctx.urgency === "high") return "concerned";
  if (ctx.hasAlert) return "analyzing";
  if (ctx.userFocused) return "focused";
  if (ctx.userDeepIdle) return "dormant";
  if (ctx.userIdle) return "attentive";
  return "calm";
}

function postureFor(e: Emotion): Posture {
  switch (e) {
    case "alarmed":   return "alert";
    case "concerned": return "upright";
    case "analyzing": return "leaning";
    case "focused":   return "retracted";
    case "dormant":   return "retracted";
    case "attentive": return "upright";
    case "satisfied": return "relaxed";
    default:          return "relaxed";
  }
}

function eyeFor(e: Emotion): EyeState {
  switch (e) {
    case "alarmed":   return "wide";
    case "concerned": return "narrowed";
    case "analyzing": return "narrowed";
    case "focused":   return "narrowed";
    case "attentive": return "scan";
    case "dormant":   return "closed";
    case "satisfied": return "open";
    default:          return "open";
  }
}

function microFor(e: Emotion): MicroExpression {
  switch (e) {
    case "alarmed":   return { kind: "throb",   period: 0.8, intensity: 1.0 };
    case "concerned": return { kind: "pulse",   period: 1.6, intensity: 0.75 };
    case "analyzing": return { kind: "scan",    period: 2.4, intensity: 0.7 };
    case "focused":   return { kind: "steady",  period: 6.0, intensity: 0.25 };
    case "attentive": return { kind: "scan",    period: 3.6, intensity: 0.55 };
    case "dormant":   return { kind: "steady",  period: 8.0, intensity: 0.15 };
    case "satisfied": return { kind: "pulse",   period: 3.2, intensity: 0.5 };
    default:          return { kind: "pulse",   period: 4.0, intensity: 0.4 };
  }
}

function energyFor(e: Emotion): number {
  return {
    alarmed: 1.0,
    concerned: 0.8,
    analyzing: 0.7,
    attentive: 0.55,
    calm: 0.4,
    satisfied: 0.5,
    focused: 0.25,
    dormant: 0.12,
  }[e];
}

function holdFor(e: Emotion): number {
  // critical states evaluate often; calm states linger
  return {
    alarmed: 1.5,
    concerned: 2.5,
    analyzing: 3,
    attentive: 5,
    calm: 7,
    satisfied: 6,
    focused: 4,
    dormant: 10,
  }[e];
}

export function computeMood(ctx: CharacterContext): CharacterMood {
  const emotion = pickEmotion(ctx);
  const { h, a } = HUE[emotion];
  return {
    emotion,
    posture: postureFor(emotion),
    eye: eyeFor(emotion),
    hue: h,
    accent: a,
    micro: microFor(emotion),
    energy: energyFor(emotion),
    hold: holdFor(emotion),
  };
}
