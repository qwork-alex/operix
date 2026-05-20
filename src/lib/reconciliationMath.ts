// Phase 5B — Reconciliation Math (read-only)
// Compares stored totals vs recalculated totals with a 0.01 tolerance.

export const RECONCILIATION_TOLERANCE = 0.01;

export type ReconciliationStatus = "valid" | "warning" | "critical";

export function reconcileTotal(stored: number, recalculated: number, tolerance = RECONCILIATION_TOLERANCE): {
  difference: number;
  absDifference: number;
  status: ReconciliationStatus;
} {
  const difference = Number((stored - recalculated).toFixed(2));
  const abs = Math.abs(difference);
  let status: ReconciliationStatus = "valid";
  if (abs > tolerance && abs <= Math.max(stored, recalculated, 1) * 0.02) status = "warning";
  else if (abs > tolerance) status = "critical";
  if (abs <= tolerance) status = "valid";
  return { difference, absDifference: abs, status };
}
