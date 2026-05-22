/**
 * AIVisualEngine — maps an AIState to a deterministic visual frame.
 * Pure function. No side effects. Drives every pixel of the entity.
 */
import type { AIState, AIVisualFrame } from "./types";

const FRAMES: Record<AIState, AIVisualFrame> = {
  idle: {
    hue: "210 100% 60%", accent: "200 80% 45%",
    glow: 0.45, spinSec: 14, pulseSec: 4.2,
    breath: 0.04, particles: 3, rings: 2, eye: 12,
    alarm: false, label: "ATIVO",
  },
  listening: {
    hue: "195 100% 62%", accent: "210 90% 50%",
    glow: 0.6, spinSec: 9, pulseSec: 2.8,
    breath: 0.05, particles: 5, rings: 2, eye: 14,
    alarm: false, label: "À ESCUTA",
  },
  thinking: {
    hue: "268 85% 65%", accent: "260 75% 50%",
    glow: 0.7, spinSec: 5, pulseSec: 1.6,
    breath: 0.06, particles: 6, rings: 3, eye: 10,
    alarm: false, label: "PROCESSANDO",
  },
  speaking: {
    hue: "152 75% 55%", accent: "152 65% 40%",
    glow: 0.65, spinSec: 11, pulseSec: 1.2,
    breath: 0.05, particles: 4, rings: 2, eye: 14,
    alarm: false, label: "RESPONDENDO",
  },
  alert: {
    hue: "38 95% 58%", accent: "28 85% 45%",
    glow: 0.85, spinSec: 4, pulseSec: 1.0,
    breath: 0.08, particles: 7, rings: 3, eye: 15,
    alarm: true, label: "ALERTA",
  },
  analyzing: {
    hue: "186 95% 60%", accent: "210 80% 45%",
    glow: 0.55, spinSec: 6, pulseSec: 2.0,
    breath: 0.04, particles: 5, rings: 3, eye: 11,
    alarm: false, label: "ANALISANDO",
  },
  syncing: {
    hue: "212 95% 60%", accent: "200 80% 45%",
    glow: 0.5, spinSec: 3, pulseSec: 2.4,
    breath: 0.03, particles: 4, rings: 2, eye: 12,
    alarm: false, label: "SINCRONIZANDO",
  },
  emergency: {
    hue: "0 95% 60%", accent: "0 85% 45%",
    glow: 1.0, spinSec: 2.2, pulseSec: 0.7,
    breath: 0.1, particles: 9, rings: 4, eye: 16,
    alarm: true, label: "EMERGÊNCIA",
  },
  standby: {
    hue: "215 35% 42%", accent: "215 25% 28%",
    glow: 0.18, spinSec: 30, pulseSec: 8.0,
    breath: 0.02, particles: 0, rings: 1, eye: 8,
    alarm: false, label: "STANDBY",
  },
};

export function frameFor(state: AIState): AIVisualFrame {
  return FRAMES[state];
}
