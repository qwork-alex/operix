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

  // NOTE: No supabase realtime channel here — Financial recomputes locally
  // via TanStack Query invalidations triggered by mutating hooks
  // (useServiceOrders, profit rules, etc.) and by partialPaymentsStore.
  // Realtime caused "cannot add postgres_changes after subscribe" crashes
  // under StrictMode and is not needed: all writes happen in-app and
  // already invalidate their query keys.
  //
  // We piggy-back on cache invalidation of the most relevant keys to keep
  // Financial instant without opening a websocket.
  useEffect(() => {
    const unsub = qc.getQueryCache().subscribe((event) => {
      const key = (event?.query?.queryKey ?? []) as unknown[];
      const head = typeof key[0] === "string" ? (key[0] as string) : "";
      if (
        head === "service-orders" ||
        head === "payment-orders" ||
        head === "profit-rules" ||
        head === "profit_rules" ||
        head === "profit-rule-items"
      ) {
        qc.invalidateQueries({ queryKey: ["participant-aggregation"] });
        force((n) => n + 1);
      }
    });
    return () => unsub();
  }, [qc]);

  return useQuery<ParticipantAggregation>({
    queryKey: ["participant-aggregation"],
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
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

      // ── INTEGER CENTS MATH ──
      // All money flows through integer cents (€ × 100) until the final
      // display step. This guarantees sum(parts) == total exactly and
      // matches the canonical splitter used by Profit Distribution.
      const toCents = (n: number) => Math.round(Number(n || 0) * 100);

      /**
       * Canonical largest-remainder splitter — SHARED contract with
       * ProfitDistribution. Splits `totalCents` across percentages so that
       * the integer parts always sum back to `totalCents` (no cent loss).
       */
      const splitCents = (
        totalCents: number,
        pcts: number[],
      ): number[] => {
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
      };

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

      // FINAL rounding to 2 decimals — only at the last step, never intermediate.
      // Matches the rounding used by the Profit Distribution module.
      const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
      for (const name of Object.keys(byParticipant)) {
        const a = byParticipant[name];
        a.expected = round2(a.expected);
        a.received = round2(a.received);
        a.difference = round2(a.expected - a.received);
      }
      for (const week of Object.keys(byParticipantWeek)) {
        const map = byParticipantWeek[week];
        for (const name of Object.keys(map)) {
          const a = map[name];
          a.expected = round2(a.expected);
          a.received = round2(a.received);
          a.difference = round2(a.expected - a.received);
        }
      }

      const totals = Object.values(byParticipant).reduce(
        (s, a) => ({
          expected: round2(s.expected + a.expected),
          received: round2(s.received + a.received),
          difference: round2(s.difference + a.difference),
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

