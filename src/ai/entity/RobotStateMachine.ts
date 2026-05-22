/**
 * RobotStateMachine — maps the global AIState to the robot's
 * animation parameters (motion, lights, particles, mood).
 *
 * Pure function. No React, no DOM.
 */
import type { AIState } from "@/agents/ai/types";

export interface RobotFrame {
  /** primary eye/chest hue (HSL string) */
  hue: string;
  /** secondary accent hue */
  accent: string;
  /** body bob amplitude (units) */
  bob: number;
  /** body bob speed (rad/s) */
  bobSpeed: number;
  /** spin rate of holo rings (rad/s) — 0 = idle, negative = reverse */
  ringSpeed: number;
  /** number of holographic rings visible */
  rings: number;
  /** eye glow intensity 0..3 */
  eyeIntensity: number;
  /** blink rate (per second). 0 = no blink */
  blinkRate: number;
  /** chest core pulse rate (Hz) */
  corePulse: number;
  /** number of jet particles */
  jets: number;
  /** antenna sway amplitude */
  antennaSway: number;
  /** head tracking speed multiplier */
  trackSpeed: number;
  /** alarm overlay */
  alarm: boolean;
  /** human label */
  label: string;
}

const FRAMES: Record<AIState, RobotFrame> = {
  idle: {
    hue: "205 100% 60%", accent: "210 80% 45%",
    bob: 0.06, bobSpeed: 1.4, ringSpeed: 0.25, rings: 1,
    eyeIntensity: 1.2, blinkRate: 0.18, corePulse: 0.6,
    jets: 3, antennaSway: 0.08, trackSpeed: 0.6,
    alarm: false, label: "IDLE",
  },
  listening: {
    hue: "195 100% 62%", accent: "210 90% 50%",
    bob: 0.08, bobSpeed: 1.8, ringSpeed: 0.45, rings: 2,
    eyeIntensity: 1.8, blinkRate: 0.25, corePulse: 1.0,
    jets: 4, antennaSway: 0.12, trackSpeed: 1.2,
    alarm: false, label: "OBSERVANDO",
  },
  thinking: {
    hue: "268 90% 65%", accent: "260 75% 50%",
    bob: 0.04, bobSpeed: 0.9, ringSpeed: 1.2, rings: 3,
    eyeIntensity: 2.0, blinkRate: 0.4, corePulse: 1.6,
    jets: 2, antennaSway: 0.05, trackSpeed: 0.4,
    alarm: false, label: "PROCESSANDO",
  },
  speaking: {
    hue: "152 80% 55%", accent: "152 65% 40%",
    bob: 0.07, bobSpeed: 2.1, ringSpeed: 0.6, rings: 2,
    eyeIntensity: 2.2, blinkRate: 0.2, corePulse: 2.4,
    jets: 4, antennaSway: 0.14, trackSpeed: 1.0,
    alarm: false, label: "RESPONDENDO",
  },
  alert: {
    hue: "38 100% 58%", accent: "28 90% 45%",
    bob: 0.1, bobSpeed: 2.6, ringSpeed: 1.0, rings: 3,
    eyeIntensity: 2.4, blinkRate: 0.5, corePulse: 2.0,
    jets: 6, antennaSway: 0.18, trackSpeed: 1.6,
    alarm: true, label: "ALERTA",
  },
  analyzing: {
    hue: "186 95% 60%", accent: "210 80% 45%",
    bob: 0.05, bobSpeed: 1.2, ringSpeed: 1.8, rings: 3,
    eyeIntensity: 1.8, blinkRate: 0.32, corePulse: 1.2,
    jets: 3, antennaSway: 0.08, trackSpeed: 1.1,
    alarm: false, label: "ANALISANDO",
  },
  syncing: {
    hue: "212 95% 60%", accent: "200 80% 45%",
    bob: 0.06, bobSpeed: 1.6, ringSpeed: 2.4, rings: 2,
    eyeIntensity: 1.6, blinkRate: 0.28, corePulse: 1.4,
    jets: 4, antennaSway: 0.1, trackSpeed: 0.9,
    alarm: false, label: "SINCRONIZANDO",
  },
  emergency: {
    hue: "0 100% 60%", accent: "0 85% 45%",
    bob: 0.14, bobSpeed: 3.4, ringSpeed: 2.6, rings: 4,
    eyeIntensity: 3.0, blinkRate: 1.2, corePulse: 4.0,
    jets: 8, antennaSway: 0.22, trackSpeed: 2.0,
    alarm: true, label: "EMERGÊNCIA",
  },
  standby: {
    hue: "215 35% 42%", accent: "215 25% 28%",
    bob: 0.02, bobSpeed: 0.5, ringSpeed: 0.05, rings: 0,
    eyeIntensity: 0.4, blinkRate: 0.05, corePulse: 0.15,
    jets: 0, antennaSway: 0.02, trackSpeed: 0.2,
    alarm: false, label: "STANDBY",
  },
};

export function robotFrameFor(state: AIState): RobotFrame {
  return FRAMES[state];
}
