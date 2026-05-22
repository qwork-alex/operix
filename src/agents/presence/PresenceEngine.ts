/**
 * PresenceEngine — top-level coordinator.
 *
 * Wires:
 *   IdleBehavior → VisibilityManager → MovementOrchestrator
 *
 * Consumes operational signals (passed in) to decide alert state.
 * Exposes a tiny subscribe API for React.
 */
import { idleTracker, type ActivityLevel } from "./IdleBehavior";
import { movementOrchestrator } from "./MovementOrchestrator";
import { decideVisibility } from "./VisibilityManager";
import type { PresenceSnapshot } from "./types";

export interface ExternalSignal {
  urgency: "low" | "normal" | "high" | "critical";
  hasAlert: boolean;
}

class Engine {
  private started = false;
  private signal: ExternalSignal = { urgency: "low", hasAlert: false };
  private activity: ActivityLevel = "active";

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    idleTracker.start();
    movementOrchestrator.start();
    idleTracker.subscribe((l) => {
      this.activity = l;
      this.recompute();
    });
  }

  updateSignal(s: ExternalSignal) {
    this.signal = s;
    this.recompute();
  }

  private recompute() {
    const decision = decideVisibility({
      activity: this.activity,
      urgency: this.signal.urgency,
      hasAlert: this.signal.hasAlert,
    });
    movementOrchestrator.setVisible(decision.visible);
    movementOrchestrator.setState(decision.state);
    if (decision.state === "alert") movementOrchestrator.replan(true);
  }

  subscribe(fn: (s: PresenceSnapshot) => void): () => void {
    return movementOrchestrator.subscribe(fn);
  }
}

export const presenceEngine = new Engine();
