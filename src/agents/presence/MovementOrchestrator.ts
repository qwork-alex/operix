/**
 * MovementOrchestrator — drives smooth, cinematic motion of the
 * presence entity toward computed safe positions.
 *
 * Uses requestAnimationFrame with cubic easing + breathing offset.
 * Frame budget is monitored; on sustained low FPS the engine enters
 * SAFE MODE (reduced fps, no breathing, jumps instead of tweens).
 */
import { buildSpatialMap, findSafePosition, AGENT_OVERLAY_SIZE } from "./SpatialAwareness";
import type { PresencePosition, PresenceSnapshot, PresenceState, PresenceMode } from "./types";

type Listener = (s: PresenceSnapshot) => void;

const REPLAN_INTERVAL_MS = 4000;
const SAFE_FPS_THRESHOLD = 28;

const PIN_STORAGE_KEY = "qw:robot:pinned-position";

class Orchestrator {
  private position: PresencePosition = { x: 0, y: 0 };
  private target: PresencePosition = { x: 0, y: 0 };
  private moveStart = 0;
  private moveDuration = 1800;
  private moveFrom: PresencePosition = { x: 0, y: 0 };
  private state: PresenceState = "idle";
  private mode: PresenceMode = "ambient";
  private visible = false;
  private listeners = new Set<Listener>();
  private rafId: number | null = null;
  private lastReplan = 0;
  private lastFrame = performance.now();
  private fps = 60;
  private safeMode = false;
  private started = false;
  private pinned = false;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    // Restore pinned position if user dragged the robot before.
    let restored: PresencePosition | null = null;
    try {
      const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as PresencePosition;
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
          restored = {
            x: Math.max(8, Math.min(window.innerWidth - AGENT_OVERLAY_SIZE - 8, p.x)),
            y: Math.max(8, Math.min(window.innerHeight - AGENT_OVERLAY_SIZE - 8, p.y)),
          };
          this.pinned = true;
        }
      }
    } catch { /* ignore */ }
    this.position = restored ?? { x: window.innerWidth - 140, y: window.innerHeight - 220 };
    this.target = { ...this.position };
    this.moveFrom = { ...this.position };
    const loop = (t: number) => {
      const dt = t - this.lastFrame;
      this.lastFrame = t;
      if (dt > 0) {
        const instantFps = 1000 / dt;
        this.fps = this.fps * 0.9 + instantFps * 0.1;
      }
      if (!this.safeMode && this.fps < SAFE_FPS_THRESHOLD) {
        this.safeMode = true;
        this.mode = "safe";
      } else if (this.safeMode && this.fps > 45) {
        this.safeMode = false;
        this.mode = "ambient";
      }

      // Replan target periodically OR when viewport changed
      if (t - this.lastReplan > REPLAN_INTERVAL_MS) {
        this.lastReplan = t;
        this.replan();
      }

      // Tween
      const progress = Math.min(1, (t - this.moveStart) / this.moveDuration);
      const eased = easeInOutCubic(progress);
      this.position = {
        x: this.moveFrom.x + (this.target.x - this.moveFrom.x) * eased,
        y: this.moveFrom.y + (this.target.y - this.moveFrom.y) * eased,
      };
      this.emit();
      const frameDelay = this.safeMode ? 120 : 0;
      this.rafId = frameDelay
        ? (window.setTimeout(() => requestAnimationFrame(loop), frameDelay) as unknown as number)
        : requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
    window.addEventListener("resize", () => this.replan(true));
    window.addEventListener("scroll", () => { this.lastReplan = 0; }, { passive: true });
  }

  setState(s: PresenceState) {
    if (s !== this.state) {
      this.state = s;
      this.emit();
    }
  }
  setVisible(v: boolean) {
    if (v !== this.visible) {
      this.visible = v;
      this.emit();
    }
  }

  replan(force = false) {
    if (typeof window === "undefined") return;
    if (this.pinned) return; // user is in charge
    const map = buildSpatialMap();
    const next = findSafePosition(this.position, map);
    const dist = Math.hypot(next.x - this.target.x, next.y - this.target.y);
    if (force || dist > 24) {
      this.moveFrom = { ...this.position };
      this.target = next;
      this.moveStart = performance.now();
      this.moveDuration = this.safeMode ? 400 : 1600 + Math.min(1200, dist * 2);
      if (this.visible && this.state !== "alert") this.setState("moving");
    }
  }

  /** Move the robot instantly to a viewport-space coord (used by drag). */
  setManualPosition(p: PresencePosition) {
    this.position = { ...p };
    this.target = { ...p };
    this.moveFrom = { ...p };
    this.moveStart = performance.now();
    this.emit();
  }

  /** Pin / unpin the robot. Pinned robots ignore auto-replan. */
  setPinned(v: boolean, persist = true) {
    this.pinned = v;
    if (persist && typeof window !== "undefined") {
      try {
        if (v) {
          window.localStorage.setItem(
            PIN_STORAGE_KEY,
            JSON.stringify(this.position),
          );
        } else {
          window.localStorage.removeItem(PIN_STORAGE_KEY);
        }
      } catch { /* ignore */ }
    }
  }

  isPinned() { return this.pinned; }


  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): PresenceSnapshot {
    return {
      state: this.state,
      mode: this.mode,
      position: this.position,
      target: this.target,
      visible: this.visible,
      fps: this.fps,
    };
  }

  private emit() {
    const s = this.snapshot();
    this.listeners.forEach((fn) => fn(s));
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const movementOrchestrator = new Orchestrator();
export { AGENT_OVERLAY_SIZE };
