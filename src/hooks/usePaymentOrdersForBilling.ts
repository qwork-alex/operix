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

export function poCodeFromId(id: string): string {
  return `OP-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export type BillingPaymentOrder = {
  id: string;
  code: string;                   // derived: OP-XXXXXXXX
  list_name: string | null;
  assigned_user_id: string | null;
  technician_name: string;
  total: number;
  service_order_id: string | null;
  created_at: string;
  week: number;
  year: number;
  client_name: string | null;
  status: string | null;
};

/**
 * Fetch raw payment_orders for invoice linking.
 * Source of truth = payment_orders ONLY — never derived from profit distribution.
 */
export function usePaymentOrdersForBilling() {
  return useQuery({
    queryKey: ["billing_link_payment_orders"],
    queryFn: async (): Promise<BillingPaymentOrder[]> => {
      const { data, error } = await supabase
        .from("payment_orders")
        .select("id, list_name, assigned_user_id, technician_name, total, service_order_id, created_at, client_name, status")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return ((data ?? []) as any[]).map((po) => {
        const d = po.created_at ? new Date(po.created_at) : new Date();
        return {
          id: po.id,
          code: poCodeFromId(po.id),
          list_name: po.list_name ?? null,
          assigned_user_id: po.assigned_user_id ?? null,
          technician_name: po.technician_name || "—",
          total: Number(po.total || 0),
          service_order_id: po.service_order_id ?? null,
          created_at: po.created_at,
          week: getISOWeek(d),
          year: d.getUTCFullYear(),
          client_name: po.client_name ?? null,
          status: po.status ?? null,
        } satisfies BillingPaymentOrder;
      });
    },
    staleTime: 60_000,
  });
}
