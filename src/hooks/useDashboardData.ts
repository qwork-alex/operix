import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "./useRole";
import { useAuth } from "./useAuth";

export function useDashboardStats() {
  const { isAdmin } = useRole();
  const { user } = useAuth();

  return useQuery({
    queryKey: ["dashboard-stats", isAdmin, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      let soQ = supabase.from("service_orders").select("total, status, created_at, created_by");
      let poQ = supabase.from("payment_orders").select("total, status, created_at, created_by");
      let frQ = supabase.from("financial_records").select("amount, type, status, created_by");
      const techQ = supabase.from("technicians").select("id");
      let clientQ = supabase.from("clients").select("id, created_by");
      const discQ = supabase.from("discrepancies").select("id, resolved");

      // Non-admin users only see their own data
      if (!isAdmin && user?.id) {
        soQ = soQ.eq("created_by", user.id);
        poQ = poQ.eq("created_by", user.id);
        frQ = frQ.eq("created_by", user.id);
        clientQ = clientQ.eq("created_by", user.id);
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
