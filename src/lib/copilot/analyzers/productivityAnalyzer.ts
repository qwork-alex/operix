import type { CopilotDataset, ProductivityInsight } from "../types";

const DAY = 24 * 60 * 60 * 1000;

export function analyzeProductivity(ds: CopilotDataset): ProductivityInsight[] {
  const out: ProductivityInsight[] = [];
  const now = ds.generatedAt;
  const recent = 30 * DAY;
  const prev = 60 * DAY;

  const byTechCurrent = new Map<string, number>();
  const byTechPrev = new Map<string, number>();
  for (const o of ds.serviceOrders) {
    if (!o.completedAt || !o.assignedTechId) continue;
    const age = now - o.completedAt;
    if (age <= recent) byTechCurrent.set(o.assignedTechId, (byTechCurrent.get(o.assignedTechId) ?? 0) + 1);
    else if (age <= prev) byTechPrev.set(o.assignedTechId, (byTechPrev.get(o.assignedTechId) ?? 0) + 1);
  }

  for (const tech of ds.technicians) {
    const cur = byTechCurrent.get(tech.id) ?? 0;
    const prv = byTechPrev.get(tech.id) ?? 0;
    if (cur + prv < 3) continue;
    const baseline = Math.max(1, prv);
    const delta = (cur - prv) / baseline;
    const severity: ProductivityInsight["severity"] =
      delta <= -0.5 ? "warn" : delta <= -0.25 ? "watch" : delta >= 0.3 ? "info" : "info";
    out.push({
      id: `prod_tech_${tech.id}`,
      subject: { kind: "technician", id: tech.id, label: tech.name ?? tech.email ?? tech.id },
      metric: "orders_per_day",
      current: cur / 30,
      baseline: prv / 30,
      deltaPct: delta,
      severity,
      reasoning: [
        `Concluídas 30d: ${cur}. 30-60d: ${prv}.`,
        delta < 0
          ? `Queda de ${Math.abs(delta * 100).toFixed(0)}% no ritmo.`
          : `Aumento de ${(delta * 100).toFixed(0)}% no ritmo.`,
      ],
      evidence: [
        { kind: "metric", ref: `tech.${tech.id}.completed_30d`, value: cur },
        { kind: "metric", ref: `tech.${tech.id}.completed_prev30d`, value: prv },
      ],
    });
  }

  /* Fuel efficiency per vehicle (cost per km) */
  const byVehicle = new Map<string, { liters: number; cost: number; firstKm?: number; lastKm?: number }>();
  for (const f of ds.fuelLogs) {
    if (!f.vehicleId) continue;
    const v = byVehicle.get(f.vehicleId) ?? { liters: 0, cost: 0 };
    v.liters += f.liters || 0;
    v.cost += f.totalCost || 0;
    if (f.kmAtFuel != null) {
      v.firstKm = v.firstKm == null ? f.kmAtFuel : Math.min(v.firstKm, f.kmAtFuel);
      v.lastKm = v.lastKm == null ? f.kmAtFuel : Math.max(v.lastKm, f.kmAtFuel);
    }
    byVehicle.set(f.vehicleId, v);
  }
  for (const [id, v] of byVehicle) {
    const km = v.firstKm != null && v.lastKm != null ? v.lastKm - v.firstKm : 0;
    if (km <= 0 || v.cost <= 0) continue;
    const costPerKm = v.cost / km;
    const severity: ProductivityInsight["severity"] = costPerKm > 0.35 ? "warn" : costPerKm > 0.25 ? "watch" : "info";
    out.push({
      id: `prod_vehicle_${id}`,
      subject: { kind: "vehicle", id, label: id.slice(0, 8) },
      metric: "fuel_efficiency",
      current: Number(costPerKm.toFixed(3)),
      baseline: 0.25,
      deltaPct: (costPerKm - 0.25) / 0.25,
      severity,
      reasoning: [`Custo €${costPerKm.toFixed(2)}/km em ${km} km percorridos.`],
      evidence: [
        { kind: "metric", ref: `vehicle.${id}.cost_per_km`, value: Number(costPerKm.toFixed(3)) },
        { kind: "metric", ref: `vehicle.${id}.km`, value: km },
      ],
    });
  }

  return out;
}
