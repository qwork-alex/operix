import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AlertLevel = "none" | "level1" | "level2" | "level3";

export interface AgingAlert {
  id: string;
  type: "service_order" | "payment_order" | "invoice";
  level: AlertLevel;
  daysOld: number;
  groupKey: string; // week for SO, list_name for PO, invoice_number for invoice
  message: string;
  itemDetails?: string; // individual pending items
}

function getAlertLevel(createdAt: string): AlertLevel {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days >= 90) return "level3";
  if (days >= 60) return "level2";
  if (days >= 30) return "level1";
  return "none";
}

function getDaysOld(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

export function useAgingAlerts() {
  return useQuery({
    queryKey: ["aging_alerts"],
    queryFn: async () => {
      // Fetch payment orders
      const { data: pos } = await supabase
        .from("payment_orders")
        .select("id, list_name, car_name, license_plate, status, created_at")
        .neq("status", "paid");

      // Fetch service orders + their payment status
      const { data: sos } = await supabase
        .from("service_orders")
        .select("id, week, car_name, license_plate, created_at");

      const soIds = (sos || []).map(s => s.id);
      const { data: linkedPos } = soIds.length > 0
        ? await supabase
            .from("payment_orders")
            .select("service_order_id, status")
            .in("service_order_id", soIds)
        : { data: [] };

      // Invoices — unpaid faturas de billing
      const { data: invs } = await supabase
        .from("billing_invoices")
        .select("id, invoice_number, customer_name, status, remaining_amount, issue_date, created_at")
        .neq("status", "paid");

      const soPaymentMap: Record<string, string> = {};
      for (const po of linkedPos || []) {
        if (po.service_order_id) {
          const s = po.status?.toLowerCase();
          if (s === "paid" || s === "pago") soPaymentMap[po.service_order_id] = "paid";
          else if (!soPaymentMap[po.service_order_id] || soPaymentMap[po.service_order_id] === "pending") {
            soPaymentMap[po.service_order_id] = s === "partial" || s === "parcial" ? "partial" : "pending";
          }
        }
      }

      const alerts: AgingAlert[] = [];

      // --- Payment order alerts grouped by list_name ---
      const poByList: Record<string, typeof pos> = {};
      for (const po of pos || []) {
        const key = po.list_name || po.id;
        if (!poByList[key]) poByList[key] = [];
        poByList[key]!.push(po);
      }

      for (const [listKey, items] of Object.entries(poByList)) {
        if (!items || !items.length) continue;
        const oldest = items.reduce((a, b) => (a.created_at < b.created_at ? a : b));
        const level = getAlertLevel(oldest.created_at);
        if (level === "none") continue;

        const allPending = items.every(i => i.status?.toLowerCase() === "pending");
        const pendingItems = items.filter(i => i.status?.toLowerCase() !== "paid" && i.status?.toLowerCase() !== "pago");

        if (allPending) {
          alerts.push({
            id: `po-list-${listKey}`,
            type: "payment_order",
            level,
            daysOld: getDaysOld(oldest.created_at),
            groupKey: listKey,
            message: `Lista "${listKey}" sem faturamento`,
          });
        } else if (pendingItems.length > 0) {
          const cars = pendingItems.map(i => i.car_name || i.license_plate || "?").join(", ");
          alerts.push({
            id: `po-list-${listKey}`,
            type: "payment_order",
            level,
            daysOld: getDaysOld(oldest.created_at),
            groupKey: listKey,
            message: `Itens pendentes na lista "${listKey}": ${cars}`,
            itemDetails: cars,
          });
        }
      }

      // --- Service order alerts grouped by week ---
      const soByWeek: Record<string, typeof sos> = {};
      for (const so of sos || []) {
        const key = so.week || "sem-semana";
        if (!soByWeek[key]) soByWeek[key] = [];
        soByWeek[key]!.push(so);
      }

      for (const [weekKey, items] of Object.entries(soByWeek)) {
        if (!items || !items.length) continue;
        const oldest = items.reduce((a, b) => (a.created_at < b.created_at ? a : b));
        const level = getAlertLevel(oldest.created_at);
        if (level === "none") continue;

        const unpaid = items.filter(i => {
          const ps = soPaymentMap[i.id];
          return !ps || ps === "pending";
        });
        if (unpaid.length === 0) continue;

        const allUnpaid = unpaid.length === items.length;
        if (allUnpaid) {
          alerts.push({
            id: `so-week-${weekKey}`,
            type: "service_order",
            level,
            daysOld: getDaysOld(oldest.created_at),
            groupKey: weekKey,
            message: `Semana "${weekKey}" sem pagamento`,
          });
        } else {
          const cars = unpaid.map(i => i.car_name || i.license_plate || "?").join(", ");
          alerts.push({
            id: `so-week-${weekKey}`,
            type: "service_order",
            level,
            daysOld: getDaysOld(oldest.created_at),
            groupKey: weekKey,
            message: `Itens não pagos na semana "${weekKey}": ${cars}`,
            itemDetails: cars,
          });
        }
      }

      // --- Invoice alerts (faturas com saldo em aberto) ---
      for (const inv of invs || []) {
        const remaining = Number((inv as any).remaining_amount ?? 0);
        if (remaining <= 0) continue;
        // Aging base: issue_date if present, fallback to created_at
        const baseDate = (inv as any).issue_date
          ? new Date((inv as any).issue_date).toISOString()
          : inv.created_at;
        const level = getAlertLevel(baseDate);
        if (level === "none") continue;
        const label = (inv as any).invoice_number || (inv as any).customer_name || inv.id;
        alerts.push({
          id: `inv-${inv.id}`,
          type: "invoice",
          level,
          daysOld: getDaysOld(baseDate),
          groupKey: String(label),
          message: `Fatura "${label}" sem pagamento`,
        });
      }

      // Sort by level desc then days desc
      const lvl = (l: AlertLevel) => l === "level3" ? 3 : l === "level2" ? 2 : l === "level1" ? 1 : 0;
      alerts.sort((a, b) => lvl(b.level) - lvl(a.level) || b.daysOld - a.daysOld);

      return alerts;
    },
    refetchInterval: 5 * 60 * 1000, // every 5 min
    staleTime: 60 * 1000,
  });
}

// Helper to get alert level for a single row
export function getRowAlertLevel(createdAt: string, status?: string): AlertLevel {
  if (status === "paid" || status === "pago") return "none";
  return getAlertLevel(createdAt);
}
