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

export function poCodeFromId(id: string): string {
  return `OP-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export type BillingPaymentOrder = {
  id: string;
  code: string;
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

export function usePaymentOrdersForBilling() {
  return useQuery({
    queryKey: ["billing_link_payment_orders"],
    queryFn: async (): Promise<BillingPaymentOrder[]> => {
      const data = await apiRequest<any[]>("/payment-orders");
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
