/**
 * RobotBehaviorTree — high-level decisions that bias the visual
 * frame based on operational context (alarm, expanded, focus mode).
 *
 * Kept tiny on purpose: the heavy lifting already lives in the
 * AIStateMachine. This layer can override specific frame fields
 * (e.g. force more rings during expanded console mode).
 */
import type { RobotFrame } from "./RobotStateMachine";
import type { AIEntitySnapshot } from "@/agents/ai/types";

export function decorateFrame(frame: RobotFrame, snap: AIEntitySnapshot): RobotFrame {
  if (snap.mode === "expanded") {
    return {
      ...frame,
      rings: Math.max(frame.rings, 2),
      ringSpeed: Math.max(frame.ringSpeed, 0.8),
      eyeIntensity: Math.max(frame.eyeIntensity, 1.6),
      label: "OPERACIONAL",
    };
  }
  return frame;
}
