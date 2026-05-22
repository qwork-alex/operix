/**
 * Presence Engine — shared types.
 */
export type PresenceState =
  | "idle"
  | "observing"
  | "thinking"
  | "alert"
  | "moving"
  | "hidden"
  | "speaking"
  | "diagnosing";

export type PresenceMode = "ambient" | "reactive" | "safe";

export interface PresencePosition {
  x: number; // px, top-left
  y: number;
}

export interface ZoneRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** higher = more important to avoid */
  weight: number;
  reason: string;
}

export interface SpatialMap {
  viewportW: number;
  viewportH: number;
  forbidden: ZoneRect[];
  preferred: ZoneRect[];
  generatedAt: number;
}

export interface PresenceSnapshot {
  state: PresenceState;
  mode: PresenceMode;
  position: PresencePosition;
  target: PresencePosition;
  visible: boolean;
  fps: number;
}
