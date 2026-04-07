import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";

export function useDashboardStats() {
  const { memberAuthIds } = useWorkspace();

  return useQuery({
    queryKey: ["dashboard-stats", memberAuthIds],
    queryFn: async () => {
      // Build queries – filter by workspace members when available
      let soQ = supabase.from("service_orders").select("total, status, created_at, created_by");
      let poQ = supabase.from("payment_orders").select("total, status, created_at, created_by");
      let frQ = supabase.from("financial_records").select("amount, type, status, created_by");
      const techQ = supabase.from("technicians").select("id");
      let clientQ = supabase.from("clients").select("id, created_by");
      const discQ = supabase.from("discrepancies").select("id, resolved");

      if (memberAuthIds.length > 0) {
        soQ = soQ.in("created_by", memberAuthIds);
        poQ = poQ.in("created_by", memberAuthIds);
        frQ = frQ.in("created_by", memberAuthIds);
        clientQ = clientQ.in("created_by", memberAuthIds);
      }

      const [soRes, poRes, frRes, techRes, clientRes, discRes] = await Promise.all([
        soQ, poQ, frQ, techQ, clientQ, discQ,
      ]);

      const serviceOrders = soRes.data ?? [];
      const paymentOrders = poRes.data ?? [];
      const financialRecords = frRes.data ?? [];
      const technicians = techRes.data ?? [];
      const clients = clientRes.data ?? [];
      const discrepancies = discRes.data ?? [];

      const totalRevenue = serviceOrders.reduce((s, o) => s + Number(o.total || 0), 0);
      const pendingPayments = paymentOrders
        .filter((p) => p.status === "pending")
        .reduce((s, o) => s + Number(o.total || 0), 0);
      const completedServices = serviceOrders.filter((s) => s.status === "completed" || s.status === "confirmed").length;
      const totalServices = serviceOrders.length;
      const performance = totalServices > 0 ? (completedServices / totalServices) * 100 : 0;

      return {
        totalRevenue,
        pendingPayments,
        completedServices,
        performance: Math.round(performance * 10) / 10,
        totalTechnicians: technicians.length,
        totalClients: clients.length,
        openDiscrepancies: discrepancies.filter((d) => !d.resolved).length,
        serviceOrders,
        paymentOrders,
        financialRecords,
      };
    },
  });
}
