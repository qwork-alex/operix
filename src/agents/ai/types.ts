/**
 * Global AI Entity — type contracts.
 *
 * One single living operational entity (no more "button", "orb",
 * "widget" — those are visual modes of the same entity).
 */

export type AIState =
  | "idle"        // calm monitoring
  | "listening"   // user focused / hovering
  | "thinking"    // streaming reply / running diagnosis
  | "speaking"    // emitting message
  | "alert"       // warn-level signal
  | "analyzing"   // observability correlating
  | "syncing"     // realtime/db activity
  | "emergency"   // critical signal
  | "standby";    // deep idle, low energy

export type AIMode = "compact" | "expanded" | "standby";

export interface AIVisualFrame {
  /** primary hue (HSL string, no `hsl()` wrapper) */
  hue: string;
  /** accent hue */
  accent: string;
  /** outer glow intensity 0..1 */
  glow: number;
  /** energy ring rotation speed (sec / turn). 0 = no spin */
  spinSec: number;
  /** core pulse period in seconds, 0 = static */
  pulseSec: number;
  /** breathing scale amplitude 0..0.2 */
  breath: number;
  /** number of orbital particles */
  particles: number;
  /** ring layers count */
  rings: number;
  /** core eye size (px) */
  eye: number;
  /** "alarm" overlay — duplicates ring as ping */
  alarm: boolean;
  /** label tag */
  label: string;
}

export interface AIEntitySnapshot {
  state: AIState;
  mode: AIMode;
  /** screen position of the entity center */
  position: { x: number; y: number };
  visible: boolean;
  /** last meaningful event title */
  lastEvent?: string;
  /** ms timestamp of last state change */
  changedAt: number;
  /** runtime fps reported by movement loop */
  fps: number;
  visual: AIVisualFrame;
}
