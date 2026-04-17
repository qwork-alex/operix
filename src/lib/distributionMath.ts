/**
 * SINGLE SOURCE OF TRUTH for monetary distribution math.
 *
 * Both Profit Distribution (writes service_order_distributions and
 * service_orders.technician_earning) and the Financial aggregation
 * (useParticipantAggregation) MUST use these helpers — never local math.
 *
 * Rules:
 *  - All monetary values flow as INTEGER CENTS (€ × 100).
 *  - No Math.round / toFixed / float ratios at intermediate steps.
 *  - Conversion back to euros only at the FINAL display step.
 *  - Invariant: sum(splitCents(total, pcts)) === total ALWAYS.
 */

export const toCents = (n: number | string | null | undefined): number =>
  Math.round(Number(n || 0) * 100);

export const centsToEuros = (c: number): number => c / 100;

/**
 * Largest-remainder splitter.
 * Distributes `totalCents` across `pcts` (percentages, sum should be 100)
 * so the integer parts always sum back to `totalCents` exactly.
 */
export function splitCents(totalCents: number, pcts: number[]): number[] {
  const n = pcts.length;
  if (n === 0) return [];
  const raw = pcts.map((p) => (totalCents * p) / 100);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = totalCents - floors.reduce((s, x) => s + x, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const out = floors.slice();
  for (let k = 0; k < order.length && remainder > 0; k++) {
    out[order[k].i] += 1;
    remainder -= 1;
  }
  return out;
}

export interface DistParticipant {
  name: string;
  pct: number;
  cents: number;
}

/**
 * Compute the canonical per-participant distribution for ONE service order
 * given its total (in euros) and a list of participants with percentages.
 */
export function computeDistributionForOrder(
  totalEuros: number,
  participants: Array<{ name: string; pct: number }>,
): DistParticipant[] {
  const totalCents = toCents(totalEuros);
  const pcts = participants.map((p) => p.pct);
  const parts = splitCents(totalCents, pcts);
  return participants.map((p, i) => ({
    name: p.name,
    pct: p.pct,
    cents: parts[i],
  }));
}

/**
 * Distribute a paid amount (in cents) across pre-computed expected parts
 * (also in cents), preserving sum(received) == paid exactly.
 */
export function splitReceivedCents(
  paidCents: number,
  expectedParts: number[],
): number[] {
  const sumExpected = expectedParts.reduce((s, x) => s + x, 0);
  if (paidCents <= 0 || sumExpected <= 0) return expectedParts.map(() => 0);
  if (paidCents >= sumExpected) return expectedParts.slice();
  const pcts = expectedParts.map((c) => (c * 100) / sumExpected);
  return splitCents(paidCents, pcts);
}
