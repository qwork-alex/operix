/**
 * Character Engine — shared types.
 *
 * The character layer is a thin "personality" model on top of the
 * PresenceEngine. It turns operational signals + user activity into
 * emotional state, posture, micro-expressions and short speech lines.
 *
 * Reference: Jarvis / military operator / premium futuristic AI.
 * NOT a mascot. NOT a chatbot.
 */

export type Emotion =
  | "calm"        // healthy system, ambient
  | "attentive"   // mild signal, observing
  | "focused"     // user is actively working
  | "concerned"   // warning detected
  | "alarmed"     // critical, demanding attention
  | "analyzing"   // diagnosing in background
  | "satisfied"   // recovery / resolution
  | "dormant";    // long idle, low presence

export type Posture =
  | "relaxed"     // soft scale, slow breath
  | "upright"     // engaged, neutral
  | "leaning"     // tilted toward user / focus point
  | "retracted"   // pulled back, low profile
  | "alert";      // tight, slightly larger, rapid micro-motion

export type EyeState =
  | "open"
  | "narrowed"    // analytical
  | "wide"        // alarmed
  | "blink"
  | "scan"        // sweeping (observing)
  | "closed";     // dormant

export interface MicroExpression {
  /** subtle, non-anthropomorphic. e.g. "pulse", "scan", "flicker" */
  kind: "pulse" | "scan" | "flicker" | "steady" | "throb";
  /** seconds */
  period: number;
  /** 0..1 — visual intensity */
  intensity: number;
}

export interface CharacterMood {
  emotion: Emotion;
  posture: Posture;
  eye: EyeState;
  /** primary glow color, HSL string ("210 100% 60%") */
  hue: string;
  /** auxiliary accent glow */
  accent: string;
  micro: MicroExpression;
  /** 0..1, drives radius/intensity of breathing & glow */
  energy: number;
  /** seconds — how long this mood should hold before re-evaluation */
  hold: number;
}

export interface CharacterContext {
  urgency: "low" | "normal" | "high" | "critical";
  hasAlert: boolean;
  signalKind?: string;
  userActive: boolean;
  userFocused: boolean;
  userIdle: boolean;
  userDeepIdle: boolean;
  fps: number;
}

export interface CharacterSnapshot {
  mood: CharacterMood;
  /** short, technical, jarvis-style line (no emojis, no jokes) */
  line?: string;
  /** monotonic id; bumps when mood meaningfully changes */
  version: number;
  generatedAt: number;
}
