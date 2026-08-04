import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

/** ISO week number (1-53). */
function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export type BillingPaymentList = {
  /** stable id = list_name (e.g. "L012483") */
  id: string;
  list_name: string;
  technician_name: string;
  assigned_user_id: string | null;
  client_name: string | null;
  city: string | null;
  year: number;
  week: number;
  total: number;            // consolidated sum of payment_orders.total
  po_count: number;         // number of underlying POs (kept internal — not shown granularly)
  payment_order_ids: string[];
  user_ids: string[];
};

/**
 * Consolidates payment_orders into LISTS, grouped by `list_name`.
 * THIS is the entity used by the billing/invoicing module — never individual OPs.
 * Source of truth: payment_orders ONLY (never profit_distribution).
 */
export function usePaymentListsConsolidated() {
  return useQuery({
    queryKey: ["billing_link_payment_lists"],
    queryFn: async (): Promise<BillingPaymentList[]> => {
      const data = await apiRequest<any[]>("/payment-orders");

      const map = new Map<string, BillingPaymentList>();
      for (const po of ((data ?? []) as any[])) {
        const ln = (po.list_name ?? "").toString().trim();
        if (!ln) continue; // ignore POs without a list — only consolidated lists are billable
        const d = po.created_at ? new Date(po.created_at) : new Date();
        const y = d.getUTCFullYear();
        const w = getISOWeek(d);
        let l = map.get(ln);
        if (!l) {
          l = {
            id: ln,
            list_name: ln,
            technician_name: po.technician_name || "—",
            assigned_user_id: po.assigned_user_id ?? null,
            client_name: po.client_name ?? null,
            city: null,
            year: y,
            week: w,
            total: 0,
            po_count: 0,
            payment_order_ids: [],
            user_ids: [],
          };
          map.set(ln, l);
        }
        l.total += Number(po.total || 0);
        l.po_count += 1;
        l.payment_order_ids.push(po.id);
        if (po.assigned_user_id && !l.user_ids.includes(po.assigned_user_id)) {
          l.user_ids.push(po.assigned_user_id);
        }
        // Use earliest (oldest) created_at as canonical for the list
        if (d.getTime() < new Date(0).getTime() || (l.year > y || (l.year === y && l.week > w))) {
          l.year = y; l.week = w;
        }
      }
      return Array.from(map.values()).sort((a, b) =>
        a.year !== b.year ? b.year - a.year
          : a.week !== b.week ? b.week - a.week
          : a.list_name.localeCompare(b.list_name)
      );
    },
    staleTime: 60_000,
  });
}
