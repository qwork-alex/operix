/**
 * RobotBehaviorTree — tiny decoration layer for contextual mood.
 *
 * Keeps the friendly base frame intact and just nudges intensity
 * when the operator opens the console.
 */
import type { RobotFrame } from "./RobotStateMachine";
import type { AIEntitySnapshot } from "@/agents/ai/types";

export function decorateFrame(frame: RobotFrame, snap: AIEntitySnapshot): RobotFrame {
  if (snap.mode === "expanded") {
    return {
      ...frame,
      eyeIntensity: Math.max(frame.eyeIntensity, 1.5),
      trackSpeed: Math.max(frame.trackSpeed, 1.0),
      label: "OPERACIONAL",
    };
  }
  return frame;
}
