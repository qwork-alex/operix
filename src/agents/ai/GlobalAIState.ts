/**
 * GlobalAIState — singleton store for the single AI entity.
 *
 * Holds the AIEntitySnapshot, exposes subscribe(), and applies
 * partial updates through a tiny reducer.
 *
 * The Provider, Reactor and Realtime layers all write here; the
 * PresenceLayer reads from it.
 */
import { deriveState, type MachineInput } from "./AIStateMachine";
import { frameFor } from "./AIVisualEngine";
import type { AIEntitySnapshot, AIMode, AIState } from "./types";

type Listener = (s: AIEntitySnapshot) => void;

function initialSnapshot(): AIEntitySnapshot {
  const state: AIState = "idle";
  return {
    state,
    mode: "compact",
    position: { x: 0, y: 0 },
    visible: false,
    changedAt: Date.now(),
    fps: 60,
    visual: frameFor(state),
  };
}

class Store {
  private snap: AIEntitySnapshot = initialSnapshot();
  private listeners = new Set<Listener>();
  private input: MachineInput = { worst: "ok", userActivity: "active" };
  /** transient flags auto-clear after timeout */
  private timers = new Map<keyof MachineInput, number>();

  current(): AIEntitySnapshot { return this.snap; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snap);
    return () => { this.listeners.delete(fn); };
  }

  /** External signal — produced by the operational hook */
  setSignal(worst: MachineInput["worst"]) {
    if (this.input.worst === worst) return;
    this.input.worst = worst;
    this.recompute();
  }

  setActivity(a: MachineInput["userActivity"]) {
    if (this.input.userActivity === a) return;
    this.input.userActivity = a;
    this.recompute();
  }

  setMode(mode: AIMode) {
    if (this.snap.mode === mode) return;
    this.snap = { ...this.snap, mode, changedAt: Date.now() };
    this.input.expanded = mode === "expanded";
    this.recompute();
  }

  setVisible(v: boolean) {
    if (this.snap.visible === v) return;
    this.snap = { ...this.snap, visible: v };
    this.emit();
  }

  setPosition(p: { x: number; y: number }, fps?: number) {
    this.snap = {
      ...this.snap,
      position: p,
      fps: typeof fps === "number" ? fps : this.snap.fps,
    };
    this.emit();
  }

  /** Pulse a transient flag for `ms` then auto-clear. */
  pulse(flag: "thinking" | "speaking" | "syncing" | "analyzing", ms = 1800) {
    this.input[flag] = true;
    const prev = this.timers.get(flag);
    if (prev) window.clearTimeout(prev);
    const id = window.setTimeout(() => {
      this.input[flag] = false;
      this.timers.delete(flag);
      this.recompute();
    }, ms);
    this.timers.set(flag, id);
    this.recompute();
  }

  noteEvent(title: string) {
    this.snap = { ...this.snap, lastEvent: title };
    this.emit();
  }

  private recompute() {
    const next = deriveState(this.input);
    if (next === this.snap.state) return;
    this.snap = {
      ...this.snap,
      state: next,
      visual: frameFor(next),
      changedAt: Date.now(),
    };
    this.emit();
  }

  private emit() {
    const s = this.snap;
    this.listeners.forEach((fn) => fn(s));
  }
}

export const globalAI = new Store();
