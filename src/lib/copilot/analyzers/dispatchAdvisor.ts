import type { CopilotDataset, DispatchSuggestion } from "../types";

const DAY = 24 * 60 * 60 * 1000;

interface TechStat {
  id: string;
  name: string;
  recentLoad: number;          // open orders assigned
  completedLast30: number;
  avgRevenue: number;
  affinity: Map<string, number>; // client/platform → frequency
}

/**
 * Suggests the most-fit technician for each open, unassigned (or weakly-assigned)
 * service order, using historical completion volume + client/platform affinity
 * and current workload as the scoring signals.
 */
export function suggestDispatch(ds: CopilotDataset): DispatchSuggestion[] {
  const stats = new Map<string, TechStat>();
  const now = ds.generatedAt;

  for (const t of ds.technicians) {
    stats.set(t.id, {
      id: t.id,
      name: t.name ?? t.email ?? t.id,
      recentLoad: 0,
      completedLast30: 0,
      avgRevenue: 0,
      affinity: new Map(),
    });
  }

  let revenueSum = 0;
  let revenueCount = 0;
  for (const o of ds.serviceOrders) {
    if (!o.assignedTechId) continue;
    const s = stats.get(o.assignedTechId);
    if (!s) continue;
    if (!o.completedAt) s.recentLoad += 1;
    if (o.completedAt && now - o.completedAt < 30 * DAY) {
      s.completedLast30 += 1;
      if (o.amount) {
        s.avgRevenue = (s.avgRevenue * (s.completedLast30 - 1) + o.amount) / s.completedLast30;
        revenueSum += o.amount;
        revenueCount += 1;
      }
    }
    const tag = o.platform || o.client;
    if (tag) s.affinity.set(tag, (s.affinity.get(tag) ?? 0) + 1);
  }

  const globalAvgRevenue = revenueCount ? revenueSum / revenueCount : 0;
  const maxLoad = Math.max(1, ...Array.from(stats.values()).map((s) => s.recentLoad));

  const candidates: DispatchSuggestion[] = [];
  const openUnassigned = ds.serviceOrders.filter(
    (o) => !o.completedAt && (!o.assignedTechId || o.assignedTechId === ""),
  );

  for (const o of openUnassigned) {
    const ranked: { tech: TechStat; score: number; why: string[] }[] = [];
    for (const s of stats.values()) {
      const loadPenalty = s.recentLoad / maxLoad;                  // 0..1
      const expScore = Math.min(1, s.completedLast30 / 20);        // up to 20 closes = 1
      const tag = o.platform || o.client;
      const affinity = tag ? Math.min(1, (s.affinity.get(tag) ?? 0) / 5) : 0.3;
      const revFit =
        globalAvgRevenue > 0 ? Math.min(1, s.avgRevenue / globalAvgRevenue) : 0.5;

      const score = clamp01(
        expScore * 0.35 + affinity * 0.3 + revFit * 0.15 + (1 - loadPenalty) * 0.2,
      );
      ranked.push({
        tech: s,
        score,
        why: [
          `Carga atual: ${s.recentLoad} OS abertas.`,
          `Conclusões 30d: ${s.completedLast30}.`,
          tag ? `Afinidade com "${tag}": ${s.affinity.get(tag) ?? 0}.` : "Sem tag de cliente/plataforma.",
        ],
      });
    }
    ranked.sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 0.25) continue;

    candidates.push({
      id: `dispatch_${o.id}`,
      orderId: o.id,
      orderRef: o.ref ?? null,
      candidate: {
        techId: best.tech.id,
        techName: best.tech.name,
        vehicleId: null,
        vehiclePlate: o.vehiclePlate ?? null,
      },
      score: best.score,
      reasoning: best.why,
      evidence: [
        { kind: "record", ref: `service_orders:${o.id}`, label: o.ref ?? o.id },
        { kind: "metric", ref: `tech.${best.tech.id}.completed_30d`, value: best.tech.completedLast30 },
      ],
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 15);
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
