import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * READ-ONLY financial aggregation engine.
 *
 * Sources:
 *  - service_orders               → OS universe + total
 *  - service_order_distributions  → Expected per participant (rule-driven)
 *  - payment_orders               → amount_paid / total → received_ratio
 *
 * Rules:
 *  - OS without any distribution row are IGNORED (no fallback).
 *  - Received per participant = distributed_value × Σ(amount_paid / total) of linked POs
 *    capped at 1 (paid > total ⇒ ratio 1).
 *  - Pending PO (amount_paid = 0) ⇒ contributes 0.
 *  - Partial PO ⇒ proportional contribution.
 *  - Paid PO (amount_paid ≥ total) ⇒ full contribution.
 *
 * NEVER writes to any of these tables.
 */

export interface ParticipantAgg {
  name: string;
  expected: number;
  received: number;
  difference: number;
}

export interface ParticipantAggregation {
  byParticipant: Record<string, ParticipantAgg>;
  byParticipantYearMonth: Record<string, Record<string, Record<string, ParticipantAgg>>>;
  // year → month(YYYY-MM) → name → agg
  totals: { expected: number; received: number; difference: number };
  debug: {
    serviceOrdersUsed: number;
    serviceOrdersTotal: number;
    paymentOrdersUsed: number;
    paymentOrdersTotal: number;
    missingSnapshotCount: number;
    missingSnapshotIds: string[];
  };
}

function emptyAgg(name: string): ParticipantAgg {
  return { name, expected: 0, received: 0, difference: 0 };
}

export function useParticipantAggregation() {
  return useQuery<ParticipantAggregation>({
    queryKey: ["participant-aggregation"],
    staleTime: 30_000, // cache 30s — avoid recompute on every render
    queryFn: async () => {
      const [soRes, distRes, poRes] = await Promise.all([
        supabase
          .from("service_orders")
          .select("id, total, group_id, license_plate, week, created_at, distribution_snapshot"),
        supabase
          .from("service_order_distributions")
          .select("service_order_id, participant_name, calculated_value, percentage"),
        supabase
          .from("payment_orders")
          .select(
            "service_order_id, group_id, license_plate, list_name, total, amount_paid, status, created_at",
          ),
      ]);

      const serviceOrders = soRes.data ?? [];
      const distributions = distRes.data ?? [];
      const paymentOrders = poRes.data ?? [];

      // Index live distributions by service_order_id (fallback only)
      const liveDistBySo = new Map<string, { name: string; value: number }[]>();
      for (const d of distributions) {
        const list = liveDistBySo.get(d.service_order_id) ?? [];
        list.push({
          name: d.participant_name,
          value: Number(d.calculated_value || 0),
        });
        liveDistBySo.set(d.service_order_id, list);
      }

      // Resolve final distribution per OS: SNAPSHOT wins, live is fallback only.
      // The snapshot is immutable — past OS keep their original percentages
      // even if profit rules are later edited.
      const distBySo = new Map<string, { name: string; value: number }[]>();
      const missingSnapshotIds: string[] = [];
      for (const so of serviceOrders) {
        const snap = (so as any).distribution_snapshot as
          | Array<{ participant_name: string; percentage: number; calculated_value: number }>
          | null;
        if (Array.isArray(snap) && snap.length > 0) {
          const total = Number(so.total || 0);
          distBySo.set(
            so.id,
            snap.map((s) => {
              const v =
                s.calculated_value != null && !Number.isNaN(Number(s.calculated_value))
                  ? Number(s.calculated_value)
                  : total * (Number(s.percentage || 0) / 100);
              return { name: s.participant_name, value: v };
            }),
          );
        } else {
          missingSnapshotIds.push(so.id);
          const live = liveDistBySo.get(so.id);
          if (live && live.length > 0) distBySo.set(so.id, live);
        }
      }

      // Helper: normalize plate
      const normPlate = (p?: string | null) =>
        (p || "").replace(/[\s\-]/g, "").toUpperCase();

      // For each SO, find linked POs and compute aggregated received_ratio
      // received_ratio_so = Σ amount_paid / Σ total of linked POs (capped at 1)
      const ratioBySo = new Map<string, number>();
      for (const so of serviceOrders) {
        const linkedPOs = paymentOrders.filter((po) => {
          if (po.service_order_id === so.id) return true;
          if (so.group_id && po.group_id && so.group_id === po.group_id) return true;
          if (
            so.week &&
            po.list_name === so.week &&
            normPlate(so.license_plate) &&
            normPlate(po.license_plate) === normPlate(so.license_plate)
          )
            return true;
          return false;
        });

        if (linkedPOs.length === 0) {
          ratioBySo.set(so.id, 0);
          continue;
        }

        const sumTotal = linkedPOs.reduce(
          (s, po) => s + Number(po.total || 0),
          0,
        );
        const sumPaid = linkedPOs.reduce(
          (s, po) => s + Number(po.amount_paid || 0),
          0,
        );

        let ratio = 0;
        if (sumTotal > 0) ratio = Math.min(1, sumPaid / sumTotal);
        else if (sumPaid > 0) ratio = 1; // total=0 but paid → fully paid
        ratioBySo.set(so.id, ratio);
      }

      // Aggregate per participant (and per year/month)
      const byParticipant: Record<string, ParticipantAgg> = {};
      const byParticipantYearMonth: Record<
        string,
        Record<string, Record<string, ParticipantAgg>>
      > = {};

      for (const so of serviceOrders) {
        const dists = distBySo.get(so.id);
        if (!dists || dists.length === 0) continue; // IGNORE OS without rule

        const ratio = ratioBySo.get(so.id) ?? 0;
        const created = (so.created_at as string) || "";
        const year = created.slice(0, 4) || "unknown";
        const month = created.slice(0, 7) || "unknown";

        for (const d of dists) {
          const agg = (byParticipant[d.name] ??= emptyAgg(d.name));
          agg.expected += d.value;
          agg.received += d.value * ratio;
          agg.difference = agg.expected - agg.received;

          const yearMap = (byParticipantYearMonth[year] ??= {});
          const monthMap = (yearMap[month] ??= {});
          const agg2 = (monthMap[d.name] ??= emptyAgg(d.name));
          agg2.expected += d.value;
          agg2.received += d.value * ratio;
          agg2.difference = agg2.expected - agg2.received;
        }
      }

      const totals = Object.values(byParticipant).reduce(
        (s, a) => ({
          expected: s.expected + a.expected,
          received: s.received + a.received,
          difference: s.difference + a.difference,
        }),
        { expected: 0, received: 0, difference: 0 },
      );

      return { byParticipant, byParticipantYearMonth, totals };
    },
  });
}

/** Aggregate a participant across a given year (sums all months). */
export function getParticipantYearAgg(
  data: ParticipantAggregation | undefined,
  participantName: string,
  year: string,
): ParticipantAgg {
  if (!data) return emptyAgg(participantName);
  const yearMap = data.byParticipantYearMonth[year];
  if (!yearMap) return emptyAgg(participantName);
  const out = emptyAgg(participantName);
  for (const monthMap of Object.values(yearMap)) {
    const a = monthMap[participantName];
    if (!a) continue;
    out.expected += a.expected;
    out.received += a.received;
  }
  out.difference = out.expected - out.received;
  return out;
}
