import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useCan } from "./usePermission";
import { applyScope, logScope } from "@/lib/applyScope";

export function useDashboardStats() {
  const { user } = useAuth();
  const { can, isLoading: permsLoading } = useCan();
  const soView = can("service_orders", "view");
  const poView = can("payment_orders", "view");
  const finView = can("financial", "view");
  const allowed = soView.allowed || poView.allowed || finView.allowed;

  return useQuery({
    queryKey: ["dashboard-stats", allowed, soView.scope, poView.scope, finView.scope, user?.id],
    enabled: !permsLoading && allowed && !!user?.id,
    queryFn: async () => {
      logScope("dashboard", "view", soView.scope, allowed);

      let soQ = supabase.from("service_orders").select("total, status, created_at, created_by");
      let poQ = supabase.from("payment_orders").select("total, status, created_at, created_by");
      let frQ = supabase.from("financial_records").select("amount, type, status, created_by");
      const techQ = supabase.from("technicians").select("id");
      let clientQ = supabase.from("clients").select("id, created_by");
      const discQ = supabase.from("discrepancies").select("id, resolved");

      soQ = applyScope(soQ, soView.allowed ? soView.scope : "own", user) as typeof soQ;
      poQ = applyScope(poQ, poView.allowed ? poView.scope : "own", user) as typeof poQ;
      frQ = applyScope(frQ, finView.allowed ? finView.scope : "own", user) as typeof frQ;
      clientQ = applyScope(clientQ, soView.allowed ? soView.scope : "own", user) as typeof clientQ;

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
