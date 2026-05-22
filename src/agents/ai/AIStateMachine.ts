/**
 * AIStateMachine — derives the entity's AIState from operational
 * inputs (signals worst level, user activity, runtime flags).
 *
 * Pure transition logic; no React, no DOM, no side effects.
 */
import type { AIState } from "./types";

export interface MachineInput {
  worst: "ok" | "info" | "warn" | "error";
  userActivity: "active" | "idle" | "deepIdle";
  thinking?: boolean;
  speaking?: boolean;
  syncing?: boolean;
  analyzing?: boolean;
  expanded?: boolean;
}

export function deriveState(input: MachineInput): AIState {
  // hardest signals dominate
  if (input.worst === "error") return "emergency";
  if (input.worst === "warn") return "alert";

  // explicit work overrides
  if (input.thinking) return "thinking";
  if (input.speaking) return "speaking";
  if (input.analyzing) return "analyzing";
  if (input.syncing) return "syncing";

  // user interaction modes
  if (input.expanded) return "listening";
  if (input.userActivity === "deepIdle") return "standby";
  if (input.userActivity === "idle") return "listening";

  return "idle";
}
