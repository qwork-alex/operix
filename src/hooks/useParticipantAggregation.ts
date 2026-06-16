import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { partialPaymentsStore } from "@/lib/partialPaymentsStore";
import { withPromiseTimeout } from "@/lib/asyncGuard";
import {
  toCents,
  centsToEuros,
  splitCents,
  splitReceivedCents,
} from "@/lib/distributionMath";

/**
 * READ-ONLY group/distribution-driven financial engine.
 * See header docs in repo history — unchanged.
 */

export interface ParticipantAgg {
  name: string;
  expected: number;
  received: number;
  difference: number;
}

export interface ParticipantAggregation {
  byParticipant: Record<string, ParticipantAgg>;
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

  // Phase 5D: Re-run only on partialPaymentsStore changes.
  // The previous global cache subscriber called setState inside
  // queryCache.subscribe — every invalidation re-fired the subscriber
  // → "Maximum update depth exceeded" → black flashes / blank screens.
  // Mutating hooks (useServiceOrders, profit rules CRUD) already
  // invalidate ["participant-aggregation"] directly when needed.
  useEffect(() => {
    return partialPaymentsStore.subscribe(() => {
      qc.invalidateQueries({ queryKey: ["participant-aggregation"] });
    });
  }, [qc]);

  // SAFE cache subscriber — invalidate-only, NO setState, debounced.
  // Excludes own key to prevent the previous render-loop storm.
  useEffect(() => {
    let timer: number | null = null;
    const schedule = () => {
      if (timer != null) return;
      timer = window.setTimeout(() => {
        timer = null;
        qc.invalidateQueries({ queryKey: ["participant-aggregation"] });
      }, 120);
    };
    const unsub = qc.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      const action = (event as any).action;
      if (!action || action.type !== "success") return;
      const key = (event.query.queryKey ?? []) as unknown[];
      const head = typeof key[0] === "string" ? (key[0] as string) : "";
      if (
        head === "service-orders" ||
        head === "service_orders" ||
        head === "payment-orders" ||
        head === "profit-rules" ||
        head === "profit_rules" ||
        head === "profit-rule-items"
      ) {
        schedule();
      }
    });
    return () => {
      if (timer != null) window.clearTimeout(timer);
      unsub();
    };
  }, [qc]);


  return useQuery<ParticipantAggregation>({
    queryKey: ["participant-aggregation"],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 0,
    queryFn: async () => {
      const [soRes, rulesRes, ruleItemsRes] = await withPromiseTimeout(Promise.all([
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
      ]), 12000, "participant_aggregation");

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

      // ── INTEGER CENTS MATH ──
      // splitCents/toCents are imported from src/lib/distributionMath.ts
      // — the SINGLE source of truth shared with ProfitDistribution.
      // Resolve final distribution per OS in CENTS:
      //   1) snapshot wins (immutable, but re-balanced via splitCents to
      //      kill any historical 1¢ drift in stored calculated_value)
      //   2) else live rule by group_id
      //   3) else skip (no distribution → ignored)
      const distBySo = new Map<
        string,
        Array<{ name: string; cents: number; pct: number }>
      >();
      const missingSnapshotIds: string[] = [];
      let serviceOrdersWithoutGroup = 0;
      let serviceOrdersWithoutDistribution = 0;

      for (const so of serviceOrders) {
        const totalCents = toCents(so.total);
        const snap = (so as any).distribution_snapshot as
          | Array<{ participant_name: string; percentage: number; calculated_value: number }>
          | null;

        if (Array.isArray(snap) && snap.length > 0) {
          const pcts = snap.map((s) => Number(s.percentage || 0));
          const parts = splitCents(totalCents, pcts);
          distBySo.set(
            so.id,
            snap.map((s, i) => ({
              name: s.participant_name,
              pct: pcts[i],
              cents: parts[i],
            })),
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
        const pcts = live.map((d) => d.pct);
        const parts = splitCents(totalCents, pcts);
        distBySo.set(
          so.id,
          live.map((d, i) => ({ name: d.name, pct: d.pct, cents: parts[i] })),
        );
      }

      // Status-driven received cents (UI-only partial amounts).
      // For partial: received_cents = floor(participant_cents * paid / total),
      // computed in integer space — no float ratio.
      const partialStore = partialPaymentsStore.getAll();
      const paidCentsBySo = new Map<string, number>();
      const statusBySo = new Map<string, string | null>();
      for (const so of serviceOrders) {
        const totalCents = toCents(so.total);
        const status = (so as any).status as string | null;
        statusBySo.set(so.id, status);
        if (status === "paid") {
          paidCentsBySo.set(so.id, totalCents);
        } else if (status === "partial") {
          const paid = toCents(partialStore[so.id] ?? 0);
          paidCentsBySo.set(so.id, Math.min(totalCents, paid));
        } else {
          paidCentsBySo.set(so.id, 0);
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

        const paidCents = paidCentsBySo.get(so.id) ?? 0;
        weeksFound.add(week);

        // Distribute paid cents across participants using the SHARED
        // splitter — guarantees sum(received_parts) == paidCents.
        const expectedParts = dists.map((d) => d.cents);
        const receivedParts = splitReceivedCents(paidCents, expectedParts);

        for (let i = 0; i < dists.length; i++) {
          const d = dists[i];
          const exp = d.cents;
          const rec = receivedParts[i];

          const agg = (byParticipant[d.name] ??= emptyAgg(d.name));
          (agg as any)._expCents = ((agg as any)._expCents ?? 0) + exp;
          (agg as any)._recCents = ((agg as any)._recCents ?? 0) + rec;

          const weekMap = (byParticipantWeek[week] ??= {});
          const agg2 = (weekMap[d.name] ??= emptyAgg(d.name));
          (agg2 as any)._expCents = ((agg2 as any)._expCents ?? 0) + exp;
          (agg2 as any)._recCents = ((agg2 as any)._recCents ?? 0) + rec;
        }
      }

      console.debug("[ParticipantAggregation] per-OS trace", traceRows);

      // FINAL conversion: integer cents → euros (via shared centsToEuros).
      const finalize = (a: ParticipantAgg) => {
        const exp = (a as any)._expCents ?? 0;
        const rec = (a as any)._recCents ?? 0;
        a.expected = centsToEuros(exp);
        a.received = centsToEuros(rec);
        a.difference = centsToEuros(exp - rec);
        delete (a as any)._expCents;
        delete (a as any)._recCents;
      };
      for (const name of Object.keys(byParticipant)) finalize(byParticipant[name]);
      for (const week of Object.keys(byParticipantWeek)) {
        const map = byParticipantWeek[week];
        for (const name of Object.keys(map)) finalize(map[name]);
      }

      // Totals: sum participant cents (re-derive from euros via *100 round
      // to recover exact cents), convert once.
      let totExpCents = 0;
      let totRecCents = 0;
      for (const a of Object.values(byParticipant)) {
        totExpCents += Math.round(a.expected * 100);
        totRecCents += Math.round(a.received * 100);
      }
      const totals = {
        expected: centsToEuros(totExpCents),
        received: centsToEuros(totRecCents),
        difference: centsToEuros(totExpCents - totRecCents),
      };

      const serviceOrdersUsed = Array.from(distBySo.values()).filter(
        (v) => v.length > 0,
      ).length;

      // Debug log — week-based, no date filter
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
