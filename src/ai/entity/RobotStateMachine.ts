/**
 * RobotStateMachine — maps the global AIState to the robot's
 * cinematic micro-animations.
 *
 * Friendly, Pixar-readable character. NO rings, NO jets, NO alarm
 * orbs. Visual differences are conveyed through eye color, eye
 * shape (squint / wide / sad), head tilt, breathing speed and a
 * tiny red operational pilot light on the chest.
 *
 * Pure function. No React, no DOM.
 */
import type { AIState } from "@/agents/ai/types";

export type RobotMood = "calm" | "curious" | "focused" | "happy" | "concerned" | "alert";

export interface RobotFrame {
  /** primary eye hue (HSL string) */
  hue: string;
  /** subtle accent hue for chest pilot light / shoulder LED */
  accent: string;
  /** body bob amplitude (units) */
  bob: number;
  /** body bob speed (rad/s) — breathing */
  bobSpeed: number;
  /** eye glow intensity 0..2.5 */
  eyeIntensity: number;
  /** blink rate (per second). 0 = no blink */
  blinkRate: number;
  /** eye vertical scale — <1 squints (focused), >1 wide (alert) */
  eyeShape: number;
  /** head tilt bias in radians (slight personality lean) */
  headTilt: number;
  /** chest pilot LED pulse rate (Hz) */
  pilotPulse: number;
  /** show red operational pilot light */
  pilotOn: boolean;
  /** head tracking speed multiplier (0..2) */
  trackSpeed: number;
  /** semantic mood */
  mood: RobotMood;
  /** human label */
  label: string;
}

// Soft palette. White body always; only eyes + tiny pilot LED shift.
const FRAMES: Record<AIState, RobotFrame> = {
  idle: {
    hue: "205 95% 68%", accent: "0 75% 60%",
    bob: 0.05, bobSpeed: 1.2,
    eyeIntensity: 1.1, blinkRate: 0.22, eyeShape: 1.0, headTilt: 0,
    pilotPulse: 0.5, pilotOn: true, trackSpeed: 0.7,
    mood: "calm", label: "",
  },
  listening: {
    hue: "195 100% 70%", accent: "0 75% 60%",
    bob: 0.06, bobSpeed: 1.5,
    eyeIntensity: 1.4, blinkRate: 0.28, eyeShape: 1.15, headTilt: 0.08,
    pilotPulse: 0.9, pilotOn: true, trackSpeed: 1.3,
    mood: "curious", label: "OBSERVANDO",
  },
  thinking: {
    hue: "215 90% 72%", accent: "260 60% 65%",
    bob: 0.035, bobSpeed: 0.9,
    eyeIntensity: 1.2, blinkRate: 0.35, eyeShape: 0.7, headTilt: -0.05,
    pilotPulse: 1.4, pilotOn: true, trackSpeed: 0.4,
    mood: "focused", label: "PROCESSANDO",
  },
  speaking: {
    hue: "190 95% 70%", accent: "0 75% 60%",
    bob: 0.07, bobSpeed: 1.9,
    eyeIntensity: 1.5, blinkRate: 0.2, eyeShape: 1.1, headTilt: 0.04,
    pilotPulse: 1.6, pilotOn: true, trackSpeed: 1.0,
    mood: "happy", label: "RESPONDENDO",
  },
  alert: {
    hue: "32 100% 65%", accent: "10 95% 58%",
    bob: 0.075, bobSpeed: 2.0,
    eyeIntensity: 1.7, blinkRate: 0.45, eyeShape: 1.25, headTilt: 0.1,
    pilotPulse: 2.2, pilotOn: true, trackSpeed: 1.5,
    mood: "concerned", label: "ATENÇÃO",
  },
  analyzing: {
    hue: "200 95% 70%", accent: "0 70% 60%",
    bob: 0.045, bobSpeed: 1.1,
    eyeIntensity: 1.3, blinkRate: 0.3, eyeShape: 0.85, headTilt: -0.08,
    pilotPulse: 1.2, pilotOn: true, trackSpeed: 1.0,
    mood: "focused", label: "ANALISANDO",
  },
  syncing: {
    hue: "210 95% 70%", accent: "190 80% 60%",
    bob: 0.05, bobSpeed: 1.4,
    eyeIntensity: 1.2, blinkRate: 0.28, eyeShape: 1.0, headTilt: 0,
    pilotPulse: 1.4, pilotOn: true, trackSpeed: 0.9,
    mood: "calm", label: "SINCRONIZANDO",
  },
  emergency: {
    hue: "8 100% 64%", accent: "0 100% 58%",
    bob: 0.09, bobSpeed: 2.4,
    eyeIntensity: 2.0, blinkRate: 0.7, eyeShape: 1.35, headTilt: 0.12,
    pilotPulse: 3.0, pilotOn: true, trackSpeed: 1.8,
    mood: "alert", label: "EMERGÊNCIA",
  },
  standby: {
    hue: "215 35% 55%", accent: "215 25% 40%",
    bob: 0.02, bobSpeed: 0.5,
    eyeIntensity: 0.4, blinkRate: 0.06, eyeShape: 0.6, headTilt: -0.04,
    pilotPulse: 0.2, pilotOn: false, trackSpeed: 0.2,
    mood: "calm", label: "STANDBY",
  },
};

export function robotFrameFor(state: AIState): RobotFrame {
  return FRAMES[state];
}
