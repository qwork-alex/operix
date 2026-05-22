/**
 * RobotMotionEngine — cinematic easing utilities for body inertia
 * and damped rotation. No allocations in hot path.
 */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  lerp(cur, target, 1 - Math.exp(-lambda * dt));
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Critically-damped spring step (Game Programming Gems style). */
export function springStep(
  cur: number, vel: number, target: number,
  stiffness: number, damping: number, dt: number,
): [number, number] {
  const f = -stiffness * (cur - target) - damping * vel;
  const newVel = vel + f * dt;
  const newPos = cur + newVel * dt;
  return [newPos, newVel];
}
