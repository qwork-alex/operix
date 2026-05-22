/**
 * VisibilityManager — decides whether the presence entity is visible
 * given operational urgency + user activity.
 *
 * Rules:
 *  - critical signal → always visible (alert)
 *  - user focused (typing / hovering input) → hidden
 *  - idle / deep-idle → visible (observing/ambient)
 *  - active → low presence (ambient, may flick on hover)
 */
import type { ActivityLevel } from "./IdleBehavior";
import type { PresenceState } from "./types";

export interface VisibilityDecision {
  visible: boolean;
  state: PresenceState;
}

export function decideVisibility(opts: {
  activity: ActivityLevel;
  urgency: "low" | "normal" | "high" | "critical";
  hasAlert: boolean;
}): VisibilityDecision {
  const { activity, urgency, hasAlert } = opts;

  if (hasAlert && urgency === "critical") return { visible: true, state: "alert" };
  if (hasAlert && urgency === "high") return { visible: true, state: "alert" };

  if (activity === "focused") return { visible: false, state: "hidden" };

  if (activity === "active") {
    return hasAlert
      ? { visible: true, state: "observing" }
      : { visible: false, state: "hidden" };
  }

  if (activity === "idle") {
    return { visible: true, state: hasAlert ? "diagnosing" : "observing" };
  }

  // deep-idle
  return { visible: true, state: "idle" };
}
