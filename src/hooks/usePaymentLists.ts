import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** ISO week number (1-53). */
function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export type PaymentList = {
  /** stable composite key: "<userId>::S<week>::<year>" */
  id: string;
  user_id: string;
  technician_name: string;
  week: number;
  year: number;
  os_count: number;        // distinct service_orders linked
  total: number;           // sum of payment_orders.total
  payment_order_ids: string[];
  label: string;           // "Semana 21 — Murilo — 12 OS — 3240€"
};

/**
 * Groups payment_orders by (assigned_user_id, ISO week of created_at).
 * Read-only / derived — no schema change. Mirrors UX of group selector in Profit Distribution.
 */
export function usePaymentLists() {
  return useQuery({
    queryKey: ["payment_lists"],
    queryFn: async (): Promise<PaymentList[]> => {
      const { data, error } = await supabase
        .from("payment_orders")
        .select("id, assigned_user_id, technician_name, total, service_order_id, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;

      const buckets = new Map<string, PaymentList>();
      for (const po of (data ?? []) as any[]) {
        const uid = po.assigned_user_id;
        if (!uid || !po.created_at) continue;
        const d = new Date(po.created_at);
        const w = getISOWeek(d);
        const y = d.getUTCFullYear();
        const key = `${uid}::S${w}::${y}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = {
            id: key,
            user_id: uid,
            technician_name: po.technician_name || "—",
            week: w,
            year: y,
            os_count: 0,
            total: 0,
            payment_order_ids: [],
            label: "",
          };
          buckets.set(key, bucket);
        }
        bucket.payment_order_ids.push(po.id);
        bucket.total += Number(po.total || 0);
        if (po.service_order_id) bucket.os_count += 1;
      }

      // Compose label
      for (const b of buckets.values()) {
        const fmt = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
        b.label = `Semana ${b.week} — ${b.technician_name} — ${b.os_count || b.payment_order_ids.length} OS — ${fmt.format(b.total)}`;
      }

      return Array.from(buckets.values()).sort((a, b) =>
        a.year !== b.year ? b.year - a.year : b.week !== a.week ? b.week - a.week : a.technician_name.localeCompare(b.technician_name)
      );
    },
    staleTime: 60_000,
  });
}
