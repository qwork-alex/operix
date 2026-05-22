/**
 * CharacterEngine — singleton that orchestrates Emotion, Behavior and
 * Speech for the presence entity.
 *
 * Subscribes to:
 *   - idleTracker (user activity)
 *   - operational signal updates (pushed via updateSignal)
 *   - presence snapshots (fps, for safe-mode awareness)
 *
 * Emits CharacterSnapshot to subscribers; UI layers (PresenceOverlay,
 * speech bubble) consume it.
 */
import { idleTracker, type ActivityLevel } from "@/agents/presence/IdleBehavior";
import { presenceEngine } from "@/agents/presence/PresenceEngine";
import { movementOrchestrator } from "@/agents/presence/MovementOrchestrator";
import { computeMood } from "./EmotionEngine";
import { normalizeContext } from "./ContextAwareness";
import { decideBehavior } from "./BehaviorTree";
import { composeLine } from "./SpeechComposer";
import type { CharacterSnapshot } from "./types";

interface ExternalSignal {
  urgency: "low" | "normal" | "high" | "critical";
  hasAlert: boolean;
  signalKind?: string;
}

type Listener = (s: CharacterSnapshot) => void;

class Engine {
  private started = false;
  private signal: ExternalSignal = { urgency: "low", hasAlert: false };
  private activity: ActivityLevel = "active";
  private fps = 60;
  private snapshot: CharacterSnapshot = {
    mood: {
      emotion: "calm",
      posture: "relaxed",
      eye: "open",
      hue: "210 90% 60%",
      accent: "200 70% 45%",
      micro: { kind: "pulse", period: 4, intensity: 0.4 },
      energy: 0.4,
      hold: 7,
    },
    version: 0,
    generatedAt: Date.now(),
  };
  private listeners = new Set<Listener>();
  private lastSpeakAt = 0;
  private lastApproachAt = 0;
  private tickHandle: number | null = null;
  private lineTimeout: number | null = null;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    presenceEngine.start();
    idleTracker.subscribe((l) => {
      this.activity = l;
      this.recompute();
    });
    movementOrchestrator.subscribe((p) => {
      this.fps = p.fps;
    });
    this.tickHandle = window.setInterval(() => this.tick(), 1500) as unknown as number;
    this.recompute();
  }

  updateSignal(s: ExternalSignal) {
    this.signal = s;
    this.recompute();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot);
    return () => this.listeners.delete(fn);
  }

  private recompute() {
    const ctx = normalizeContext({
      urgency: this.signal.urgency,
      hasAlert: this.signal.hasAlert,
      signalKind: this.signal.signalKind,
      activity: this.activity,
      fps: this.fps,
    });
    const mood = computeMood(ctx);
    const changed =
      mood.emotion !== this.snapshot.mood.emotion ||
      mood.posture !== this.snapshot.mood.posture ||
      mood.eye !== this.snapshot.mood.eye;
    this.snapshot = {
      mood,
      line: this.snapshot.line,
      version: changed ? this.snapshot.version + 1 : this.snapshot.version,
      generatedAt: Date.now(),
    };
    this.emit();
  }

  private tick() {
    const ctx = normalizeContext({
      urgency: this.signal.urgency,
      hasAlert: this.signal.hasAlert,
      signalKind: this.signal.signalKind,
      activity: this.activity,
      fps: this.fps,
    });
    const now = Date.now();
    const action = decideBehavior({
      ctx,
      mood: this.snapshot.mood,
      sinceSpeakMs: now - this.lastSpeakAt,
      sinceApproachMs: now - this.lastApproachAt,
    });
    switch (action.type) {
      case "approach":
        this.lastApproachAt = now;
        movementOrchestrator.replan(true);
        break;
      case "withdraw":
        this.lastApproachAt = now;
        movementOrchestrator.replan(true);
        break;
      case "speak": {
        const line = composeLine(this.snapshot.mood, ctx, action.reason);
        if (line) {
          this.lastSpeakAt = now;
          this.snapshot = { ...this.snapshot, line, generatedAt: now };
          this.emit();
          if (this.lineTimeout) window.clearTimeout(this.lineTimeout);
          this.lineTimeout = window.setTimeout(() => {
            this.snapshot = { ...this.snapshot, line: undefined, generatedAt: Date.now() };
            this.emit();
          }, 6000) as unknown as number;
        }
        break;
      }
      default:
        break;
    }
  }

  private emit() {
    this.listeners.forEach((fn) => fn(this.snapshot));
  }
}

export const characterEngine = new Engine();
