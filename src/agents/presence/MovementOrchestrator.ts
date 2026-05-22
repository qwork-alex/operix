/**
 * MovementOrchestrator — cinematic spatial intelligence for the
 * AI robot. Integrates:
 *
 *   - critically-damped spring physics (no tweens / no teleports)
 *   - viewport + scroll + resize awareness
 *   - contextual docking (alerts, toasts, focused inputs)
 *   - idle wandering between preferred zones
 *   - drag momentum: velocity carries on release, settles softly
 *   - user pin memory (persisted)
 *   - route-change transition
 *   - performance guard: SAFE MODE on sustained low FPS
 *
 * The robot is rendered in viewport coordinates (position: fixed),
 * so scroll only triggers a re-plan of contextual anchors, never a
 * scroll-following translate.
 */
import { buildSpatialMap, findSafePosition, scorePosition, AGENT_OVERLAY_SIZE } from "./SpatialAwareness";
import type { PresencePosition, PresenceSnapshot, PresenceState, PresenceMode } from "./types";

type Listener = (s: PresenceSnapshot) => void;

const PIN_STORAGE_KEY = "qw:robot:pinned-position";

// Spring tuning — critically damped for cinematic settle.
const SPRING_STIFFNESS = 90;     // higher = snappier
const SPRING_DAMPING = 18;        // ≈ 2 * sqrt(stiffness) for critical
const MAX_SPEED = 4200;           // px/s safety clamp
const SETTLE_EPSILON = 0.4;       // px

const REPLAN_INTERVAL_MS = 4500;
const IDLE_WANDER_MS = 11000;
const ALERT_HOLD_MS = 6000;
const SAFE_FPS_THRESHOLD = 28;
const EDGE_MARGIN = 18;

interface Contextual {
  target: PresencePosition;
  reason: string;
  expiresAt: number;
  priority: number; // higher overrides
}

class Orchestrator {
  private position: PresencePosition = { x: 0, y: 0 };
  private target: PresencePosition = { x: 0, y: 0 };
  private velocity = { x: 0, y: 0 };
  private state: PresenceState = "idle";
  private mode: PresenceMode = "ambient";
  private visible = false;
  private listeners = new Set<Listener>();
  private rafId: number | null = null;
  private lastReplan = 0;
  private lastWander = 0;
  private lastFrame = performance.now();
  private fps = 60;
  private safeMode = false;
  private started = false;
  private pinned = false;
  private contextual: Contextual | null = null;
  private idleSince = performance.now();
  // drag bookkeeping
  private dragging = false;
  private dragSamples: Array<{ t: number; x: number; y: number }> = [];

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;

    // Restore user-pinned position
    let restored: PresencePosition | null = null;
    try {
      const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as PresencePosition;
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
          restored = this.clampToViewport(p);
          this.pinned = true;
        }
      }
    } catch { /* ignore */ }

    this.position = restored ?? { x: window.innerWidth - 140, y: window.innerHeight - 220 };
    this.target = { ...this.position };

    const loop = (t: number) => {
      const rawDt = (t - this.lastFrame) / 1000;
      this.lastFrame = t;
      const dt = Math.min(0.05, Math.max(0.001, rawDt)); // clamp to avoid huge steps

      // FPS tracking
      if (rawDt > 0) {
        const instantFps = 1 / rawDt;
        this.fps = this.fps * 0.9 + instantFps * 0.1;
      }
      if (!this.safeMode && this.fps < SAFE_FPS_THRESHOLD) {
        this.safeMode = true; this.mode = "safe";
      } else if (this.safeMode && this.fps > 45) {
        this.safeMode = false; this.mode = "ambient";
      }

      // Expire stale contextual anchor
      if (this.contextual && t > this.contextual.expiresAt) {
        this.contextual = null;
        this.lastReplan = 0;
      }

      // Periodic replan of background target
      if (t - this.lastReplan > REPLAN_INTERVAL_MS) {
        this.lastReplan = t;
        this.replan();
      }

      // Idle wandering — only if calm + not pinned + no contextual + no recent drag
      if (
        !this.pinned && !this.contextual && !this.dragging &&
        (this.state === "idle" || this.state === "observing") &&
        t - this.lastWander > IDLE_WANDER_MS
      ) {
        this.lastWander = t;
        this.wander();
      }

      // Spring integration toward target — skipped while dragging
      if (!this.dragging) {
        const ax = -SPRING_STIFFNESS * (this.position.x - this.target.x) - SPRING_DAMPING * this.velocity.x;
        const ay = -SPRING_STIFFNESS * (this.position.y - this.target.y) - SPRING_DAMPING * this.velocity.y;
        this.velocity.x = clamp(this.velocity.x + ax * dt, -MAX_SPEED, MAX_SPEED);
        this.velocity.y = clamp(this.velocity.y + ay * dt, -MAX_SPEED, MAX_SPEED);
        this.position.x += this.velocity.x * dt;
        this.position.y += this.velocity.y * dt;

        // Soft edge clamp so momentum never throws it offscreen
        const c = this.clampToViewport(this.position);
        if (c.x !== this.position.x) { this.position.x = c.x; this.velocity.x *= -0.3; }
        if (c.y !== this.position.y) { this.position.y = c.y; this.velocity.y *= -0.3; }

        // Settle
        const dist = Math.hypot(this.position.x - this.target.x, this.position.y - this.target.y);
        const speed = Math.hypot(this.velocity.x, this.velocity.y);
        if (dist < SETTLE_EPSILON && speed < 2) {
          this.position = { ...this.target };
          this.velocity = { x: 0, y: 0 };
          if (this.state === "moving") this.setState("idle");
        }
      }

      this.emit();

      const frameDelay = this.safeMode ? 80 : 0;
      this.rafId = frameDelay
        ? (window.setTimeout(() => requestAnimationFrame(loop), frameDelay) as unknown as number)
        : requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);

    this.installEnvironmentObservers();
  }

  /* ------------------------------------------------------------ */
  /*  Awareness wiring                                            */
  /* ------------------------------------------------------------ */

  private installEnvironmentObservers() {
    // viewport
    window.addEventListener("resize", () => this.replan(true));

    // scroll → reconsider contextual + background plan
    let scrollT = 0;
    window.addEventListener("scroll", () => {
      const now = performance.now();
      if (now - scrollT < 120) return;
      scrollT = now;
      this.lastReplan = 0;
    }, { passive: true, capture: true });

    // route changes (SPA): wrap pushState/replaceState + listen popstate
    const fire = () => {
      this.contextual = null;
      this.lastReplan = 0;
      // small intentional ease toward a fresh safe spot
      setTimeout(() => this.replan(true), 220);
    };
    window.addEventListener("popstate", fire);
    const orig = { push: history.pushState, replace: history.replaceState };
    history.pushState = function (...args) { const r = orig.push.apply(this, args); fire(); return r; };
    history.replaceState = function (...args) { const r = orig.replace.apply(this, args); fire(); return r; };

    // focus tracking — dock next to focused inputs
    document.addEventListener("focusin", (e) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (!(tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      // Side-dock: prefer the side with more empty space
      const spaceRight = window.innerWidth - r.right;
      const spaceLeft = r.left;
      const useRight = spaceRight >= spaceLeft;
      const x = useRight
        ? Math.min(window.innerWidth - AGENT_OVERLAY_SIZE - EDGE_MARGIN, r.right + 24)
        : Math.max(EDGE_MARGIN, r.left - AGENT_OVERLAY_SIZE - 24);
      const y = Math.max(80, Math.min(window.innerHeight - AGENT_OVERLAY_SIZE - 40, r.top + r.height / 2 - AGENT_OVERLAY_SIZE / 2));
      this.setContextualAnchor({ x, y }, "focus", 4, 4000);
    });

    // alert / toast magnet
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          const isAlert =
            n.matches?.("[role='alert'], [data-agent-alert], [data-sonner-toast], .destructive") ||
            n.querySelector?.("[role='alert'], [data-agent-alert], [data-sonner-toast]");
          if (!isAlert) return;
          const target = (n.matches?.("[role='alert'], [data-agent-alert], [data-sonner-toast]")
            ? n
            : n.querySelector("[role='alert'], [data-agent-alert], [data-sonner-toast]")) as HTMLElement | null;
          if (!target) return;
          const r = target.getBoundingClientRect();
          if (r.width < 8 || r.height < 8) return;
          // Dock just above/below the alert, on the side with space
          const spaceBelow = window.innerHeight - r.bottom;
          const useBelow = spaceBelow > 180;
          const x = Math.max(EDGE_MARGIN, Math.min(window.innerWidth - AGENT_OVERLAY_SIZE - EDGE_MARGIN, r.left + r.width / 2 - AGENT_OVERLAY_SIZE / 2));
          const y = useBelow
            ? Math.min(window.innerHeight - AGENT_OVERLAY_SIZE - EDGE_MARGIN, r.bottom + 16)
            : Math.max(EDGE_MARGIN, r.top - AGENT_OVERLAY_SIZE - 16);
          this.setContextualAnchor({ x, y }, "alert", 10, ALERT_HOLD_MS);
          if (this.state !== "alert") this.setState("alert");
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ------------------------------------------------------------ */
  /*  Targeting                                                   */
  /* ------------------------------------------------------------ */

  /** External code may push a contextual anchor (UI focus, alert area, etc). */
  setContextualAnchor(p: PresencePosition, reason: string, priority = 5, ttl = 4000) {
    if (this.pinned) return;
    const clamped = this.clampToViewport(p);
    if (this.contextual && this.contextual.priority > priority) return;
    this.contextual = {
      target: clamped,
      reason,
      priority,
      expiresAt: performance.now() + ttl,
    };
    this.target = clamped;
    if (this.visible) this.setState("moving");
    this.idleSince = performance.now();
  }

  replan(force = false) {
    if (typeof window === "undefined" || this.pinned || this.dragging) return;

    if (this.contextual) {
      // Re-validate contextual anchor against current spatial map
      const map = buildSpatialMap();
      if (scorePosition(this.contextual.target, map) > 200) {
        this.contextual = null;
      } else {
        this.target = this.contextual.target;
        return;
      }
    }

    const map = buildSpatialMap();
    const next = findSafePosition(this.position, map);
    const dist = Math.hypot(next.x - this.target.x, next.y - this.target.y);
    if (force || dist > 24) {
      this.target = next;
      if (this.visible && this.state !== "alert") this.setState("moving");
    }
  }

  private wander() {
    if (typeof window === "undefined") return;
    const map = buildSpatialMap();
    // pick a random preferred zone (excluding current), score it
    const zones = map.preferred.length ? map.preferred : [];
    if (!zones.length) return;
    const pick = zones[Math.floor(Math.random() * zones.length)];
    const candidate = {
      x: pick.x + pick.w / 2 - AGENT_OVERLAY_SIZE / 2 + (Math.random() - 0.5) * 40,
      y: pick.y + pick.h / 2 - AGENT_OVERLAY_SIZE / 2 + (Math.random() - 0.5) * 40,
    };
    const clamped = this.clampToViewport(candidate);
    if (scorePosition(clamped, map) < 200) {
      this.target = clamped;
      this.setState("moving");
    }
  }

  /* ------------------------------------------------------------ */
  /*  Drag API                                                    */
  /* ------------------------------------------------------------ */

  beginDrag() {
    this.dragging = true;
    this.dragSamples = [{ t: performance.now(), x: this.position.x, y: this.position.y }];
    this.velocity = { x: 0, y: 0 };
    this.contextual = null;
  }

  /** Move while dragging — also records velocity samples. */
  dragTo(p: PresencePosition) {
    this.position = this.clampToViewport(p);
    this.target = this.position;
    const now = performance.now();
    this.dragSamples.push({ t: now, x: this.position.x, y: this.position.y });
    // keep last ~120ms of samples
    while (this.dragSamples.length > 2 && now - this.dragSamples[0].t > 120) {
      this.dragSamples.shift();
    }
    this.emit();
  }

  /** End drag with momentum carry-over and spring settle. */
  endDrag(opts?: { pin?: boolean }) {
    if (!this.dragging) return;
    this.dragging = false;
    // compute throw velocity from samples
    if (this.dragSamples.length >= 2) {
      const a = this.dragSamples[0];
      const b = this.dragSamples[this.dragSamples.length - 1];
      const dtSec = Math.max(0.016, (b.t - a.t) / 1000);
      this.velocity = {
        x: clamp((b.x - a.x) / dtSec, -MAX_SPEED, MAX_SPEED),
        y: clamp((b.y - a.y) / dtSec, -MAX_SPEED, MAX_SPEED),
      };
    } else {
      this.velocity = { x: 0, y: 0 };
    }
    this.dragSamples = [];

    if (opts?.pin) {
      // pin where the user dropped (after momentum) — let it settle there
      this.target = { ...this.position };
      this.setPinned(true);
    } else {
      // release back to auto: pick a safe spot relative to drop location
      this.setPinned(false);
      const map = buildSpatialMap();
      this.target = findSafePosition(this.position, map);
      this.setState("moving");
    }
  }

  /* ------------------------------------------------------------ */
  /*  Legacy / public API                                         */
  /* ------------------------------------------------------------ */

  setState(s: PresenceState) {
    if (s !== this.state) {
      this.state = s;
      if (s === "idle" || s === "observing") this.idleSince = performance.now();
      this.emit();
    }
  }
  setVisible(v: boolean) {
    if (v !== this.visible) {
      this.visible = v;
      this.emit();
    }
  }

  /** Snap-set (kept for back-compat with AIPresenceLayer drag). */
  setManualPosition(p: PresencePosition) {
    const clamped = this.clampToViewport(p);
    this.position = clamped;
    this.target = clamped;
    this.velocity = { x: 0, y: 0 };
    this.emit();
  }

  setPinned(v: boolean, persist = true) {
    this.pinned = v;
    if (persist && typeof window !== "undefined") {
      try {
        if (v) {
          window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(this.position));
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
    return () => { this.listeners.delete(fn); };
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

  private clampToViewport(p: PresencePosition): PresencePosition {
    return {
      x: Math.max(EDGE_MARGIN, Math.min(window.innerWidth - AGENT_OVERLAY_SIZE - EDGE_MARGIN, p.x)),
      y: Math.max(EDGE_MARGIN, Math.min(window.innerHeight - AGENT_OVERLAY_SIZE - EDGE_MARGIN, p.y)),
    };
  }
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

export const movementOrchestrator = new Orchestrator();
export { AGENT_OVERLAY_SIZE };
