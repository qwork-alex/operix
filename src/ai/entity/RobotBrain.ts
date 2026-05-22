/**
 * RobotBrain — bridges the existing GlobalAI singleton with the
 * 3D robot rendering layer. Provides a React hook that yields a
 * stable RobotFrame + the live AIEntitySnapshot.
 */
import { useEffect, useState } from "react";
import { globalAI } from "@/agents/ai/GlobalAIState";
import type { AIEntitySnapshot } from "@/agents/ai/types";
import { robotFrameFor, type RobotFrame } from "./RobotStateMachine";

export function useRobotBrain(): { snapshot: AIEntitySnapshot; frame: RobotFrame } {
  const [snap, setSnap] = useState<AIEntitySnapshot>(() => globalAI.current());
  useEffect(() => globalAI.subscribe(setSnap), []);
  return { snapshot: snap, frame: robotFrameFor(snap.state) };
}
