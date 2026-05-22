/**
 * ContextAwareness — bridges external sources (operational signals,
 * idle tracker, presence fps) into a normalized CharacterContext.
 *
 * Stateless adapter; called by CharacterEngine.
 */
import type { ActivityLevel } from "@/agents/presence/IdleBehavior";
import type { CharacterContext } from "./types";

export interface RawContextInputs {
  urgency: "low" | "normal" | "high" | "critical";
  hasAlert: boolean;
  signalKind?: string;
  activity: ActivityLevel;
  fps: number;
}

export function normalizeContext(raw: RawContextInputs): CharacterContext {
  return {
    urgency: raw.urgency,
    hasAlert: raw.hasAlert,
    signalKind: raw.signalKind,
    userActive: raw.activity === "active" || raw.activity === "focused",
    userFocused: raw.activity === "focused",
    userIdle: raw.activity === "idle",
    userDeepIdle: raw.activity === "deep-idle",
    fps: raw.fps,
  };
}
