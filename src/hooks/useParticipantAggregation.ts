import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { partialPaymentsStore } from "@/lib/partialPaymentsStore";

/**
 * READ-ONLY group/distribution-driven financial engine.
 *
 * Architecture: Service Orders → Groups → Distribution Rules → Participants.
 *
 * Sources (read-only):
 *  - service_orders                 → universe + total + status + group_id
 *      Uses the FROZEN distribution_snapshot (immutable per OS).
 *      Falls back to the live profit_rule for OS without snapshot,
 *      matched by `group_id ∈ profit_rules.group_ids`.
 *  - profit_rules + profit_rule_items
 *                                    → ensures every participant from any
 *                                      active rule appears (even with 0 OS).
 *  - localStorage (partialPaymentsStore)
 *                                    → Financial-UI-only partial amounts.
 *
 * Status rules:
 *  - 'paid'     → received = expected (full)
 *  - 'partial'  → received = partial_amount(UI) × percentage_share
 *                 (i.e. snapshot_value × partial/total, ratio capped at 1)
 *  - 'pending'  → received = 0
 *
 * NEVER writes to any of these tables.
 * NEVER reads from payment_orders or financial_entries.
 * NEVER filters by technician ownership — only group linkage matters.
 */

export interface ParticipantAgg {
  name: string;
  expected: number;
  received: number;
  difference: number;
}

export interface ParticipantAggregation {
  byParticipant: Record<string, ParticipantAgg>;
  /** week (raw service_orders.week, e.g. "40") → name → agg.
   *  Time dimension is WEEK — no date/year filtering. */
  byParticipantWeek: Record<string, Record<string, ParticipantAgg>>;
  totals: { expected: number; received: number; difference: number };
  debug: {
    serviceOrdersUsed: number;
    serviceOrdersTotal: number;
    serviceOrdersBeforeFilter: number;
    serviceOrdersAfterFilter: number;
    serviceOrdersWithoutGroup: number;
    serviceOrdersWithoutDistribution: number;
    participantsFromRules: number;
    missingSnapshotCount: number;
    missingSnapshotIds: string[];
    weeksFound: string[];
  };
}

function emptyAgg(name: string): ParticipantAgg {
  return { name, expected: 0, received: 0, difference: 0 };
}

export function useParticipantAggregation() {
  const qc = useQueryClient();
  const [, force] = useState(0);

  // Re-run aggregation whenever the UI-only partial store changes.
  useEffect(() => {
    return partialPaymentsStore.subscribe(() => {
      qc.invalidateQueries({ queryKey: ["participant-aggregation"] });
      force((n) => n + 1);
    });
  }, [qc]);

  return useQuery<ParticipantAggregation>({
    queryKey: ["participant-aggregation"],
    staleTime: 30_000,
    queryFn: async () => {
      const [soRes, rulesRes, ruleItemsRes] = await Promise.all([
        supabase
          .from("service_orders")
          .select(
            "id, total, status, group_id, week, distribution_snapshot",
          ),
        supabase
          .from("profit_rules")
          .select("id, group_ids, is_active")
          .eq("is_active", true),
        supabase
          .from("profit_rule_items")
          .select("rule_id, participant_name, percentage"),
      ]);

      const serviceOrders = soRes.data ?? [];
      const rules = rulesRes.data ?? [];
      const ruleItems = ruleItemsRes.data ?? [];

      // Index rule items by rule_id
      const itemsByRule = new Map<string, Array<{ name: string; pct: number }>>();
      for (const it of ruleItems) {
        const list = itemsByRule.get(it.rule_id) ?? [];
        list.push({
          name: it.participant_name,
          pct: Number(it.percentage || 0),
        });
        itemsByRule.set(it.rule_id, list);
      }

      // Map: group_id → distribution items (live fallback)
      const liveDistByGroup = new Map<string, Array<{ name: string; pct: number }>>();
      for (const r of rules) {
        const items = itemsByRule.get(r.id);
        if (!items || items.length === 0) continue;
        const groups = (r.group_ids ?? []) as string[];
        for (const g of groups) {
          if (!g) continue;
          // Last active rule wins for a group; merge by name otherwise
          liveDistByGroup.set(g, items);
        }
      }

      // Resolve final distribution per OS:
      //   1) snapshot wins (immutable)
      //   2) else live rule by group_id
      //   3) else skip (no distribution → ignored)
      const distBySo = new Map<
        string,
        Array<{ name: string; value: number; pct: number }>
      >();
      const missingSnapshotIds: string[] = [];
      let serviceOrdersWithoutGroup = 0;
      let serviceOrdersWithoutDistribution = 0;

      for (const so of serviceOrders) {
        const total = Number(so.total || 0);
        const snap = (so as any).distribution_snapshot as
          | Array<{ participant_name: string; percentage: number; calculated_value: number }>
          | null;

        if (Array.isArray(snap) && snap.length > 0) {
          distBySo.set(
            so.id,
            snap.map((s) => {
              const pct = Number(s.percentage || 0);
              const v =
                s.calculated_value != null && !Number.isNaN(Number(s.calculated_value))
                  ? Number(s.calculated_value)
                  : total * (pct / 100);
              return { name: s.participant_name, value: v, pct };
            }),
          );
          continue;
        }

        missingSnapshotIds.push(so.id);

        if (!so.group_id) {
          serviceOrdersWithoutGroup++;
          continue;
        }
        const live = liveDistByGroup.get(so.group_id);
        if (!live || live.length === 0) {
          serviceOrdersWithoutDistribution++;
          continue;
        }
        distBySo.set(
          so.id,
          live.map((d) => ({
            name: d.name,
            pct: d.pct,
            value: total * (d.pct / 100),
          })),
        );
      }

      // Status-driven received ratio (UI-only partial amounts)
      const partialStore = partialPaymentsStore.getAll();
      const ratioBySo = new Map<string, number>();
      for (const so of serviceOrders) {
        const total = Number(so.total || 0);
        const status = (so as any).status as string | null;
        if (status === "paid") {
          ratioBySo.set(so.id, 1);
        } else if (status === "partial") {
          const paid = Number(partialStore[so.id] ?? 0);
          let ratio = 0;
          if (total > 0) ratio = Math.min(1, paid / total);
          else if (paid > 0) ratio = 1;
          ratioBySo.set(so.id, ratio);
        } else {
          ratioBySo.set(so.id, 0);
        }
      }

      // Aggregate per participant — and by WEEK (no date/year filtering).
      // STRICT: only participants tied to each OS via its own group/snapshot
      // contribute. No global participant seeding — that caused contamination
      // (every tech showing up on every OS with 0).
      const byParticipant: Record<string, ParticipantAgg> = {};
      const byParticipantWeek: Record<string, Record<string, ParticipantAgg>> = {};
      const weeksFound = new Set<string>();
      const allParticipantNames = new Set<string>();
      for (const items of itemsByRule.values()) {
        for (const it of items) allParticipantNames.add(it.name);
      }

      // Reverse index for debug: group_id → rule_id(s)
      const ruleIdsByGroup = new Map<string, string[]>();
      for (const r of rules) {
        for (const g of (r.group_ids ?? []) as string[]) {
          if (!g) continue;
          const list = ruleIdsByGroup.get(g) ?? [];
          list.push(r.id);
          ruleIdsByGroup.set(g, list);
        }
      }
      const traceRows: Array<{
        service_order_id: string;
        group_id: string | null;
        rule_id: string | null;
        source: "snapshot" | "live-rule" | "none";
        participants_applied: string[];
      }> = [];

      for (const so of serviceOrders) {
        const dists = distBySo.get(so.id);
        const week = ((so as any).week as string | null)?.trim() || "unknown";
        const snap = (so as any).distribution_snapshot;
        const ruleIds = so.group_id ? ruleIdsByGroup.get(so.group_id) ?? [] : [];

        if (!dists || dists.length === 0) {
          traceRows.push({
            service_order_id: so.id,
            group_id: so.group_id ?? null,
            rule_id: ruleIds[0] ?? null,
            source: "none",
            participants_applied: [],
          });
          continue;
        }

        traceRows.push({
          service_order_id: so.id,
          group_id: so.group_id ?? null,
          rule_id: ruleIds[0] ?? null,
          source: Array.isArray(snap) && snap.length > 0 ? "snapshot" : "live-rule",
          participants_applied: dists.map((d) => d.name),
        });

        const ratio = ratioBySo.get(so.id) ?? 0;
        weeksFound.add(week);

        for (const d of dists) {
          const agg = (byParticipant[d.name] ??= emptyAgg(d.name));
          agg.expected += d.value;
          agg.received += d.value * ratio;
          agg.difference = agg.expected - agg.received;

          const weekMap = (byParticipantWeek[week] ??= {});
          const agg2 = (weekMap[d.name] ??= emptyAgg(d.name));
          agg2.expected += d.value;
          agg2.received += d.value * ratio;
          agg2.difference = agg2.expected - agg2.received;
        }
      }

      // eslint-disable-next-line no-console
      console.debug("[ParticipantAggregation] per-OS trace", traceRows);

      const totals = Object.values(byParticipant).reduce(
        (s, a) => ({
          expected: s.expected + a.expected,
          received: s.received + a.received,
          difference: s.difference + a.difference,
        }),
        { expected: 0, received: 0, difference: 0 },
      );

      const serviceOrdersUsed = Array.from(distBySo.values()).filter(
        (v) => v.length > 0,
      ).length;

      // Debug log — week-based, no date filter
      // eslint-disable-next-line no-console
      console.debug("[ParticipantAggregation] week-based aggregation", {
        serviceOrdersBeforeFilter: serviceOrders.length,
        serviceOrdersAfterFilter: serviceOrdersUsed,
        weeksFound: Array.from(weeksFound).sort(),
        totals,
      });

      return {
        byParticipant,
        byParticipantWeek,
        totals,
        debug: {
          serviceOrdersUsed,
          serviceOrdersTotal: serviceOrders.length,
          serviceOrdersBeforeFilter: serviceOrders.length,
          serviceOrdersAfterFilter: serviceOrdersUsed,
          serviceOrdersWithoutGroup,
          serviceOrdersWithoutDistribution,
          participantsFromRules: allParticipantNames.size,
          missingSnapshotCount: missingSnapshotIds.length,
          missingSnapshotIds,
          weeksFound: Array.from(weeksFound).sort(),
        },
      };
    },
  });
}

/**
 * Year is DISPLAY-ONLY in the Financial UI — service_orders have no date,
 * only `week`. This returns the participant's full aggregated total across
 * ALL weeks/groups (independent of the year label passed in).
 */
export function getParticipantYearAgg(
  data: ParticipantAggregation | undefined,
  participantName: string,
  _year: string,
): ParticipantAgg {
  if (!data) return emptyAgg(participantName);
  return data.byParticipant[participantName] ?? emptyAgg(participantName);
}

