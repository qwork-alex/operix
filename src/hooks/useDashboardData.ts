import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [soRes, poRes, frRes, techRes, clientRes, discRes] = await Promise.all([
        supabase.from("service_orders").select("total, status, created_at"),
        supabase.from("payment_orders").select("total, status, created_at"),
        supabase.from("financial_records").select("amount, type, status"),
        supabase.from("technicians").select("id"),
        supabase.from("clients").select("id"),
        supabase.from("discrepancies").select("id, resolved"),
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
