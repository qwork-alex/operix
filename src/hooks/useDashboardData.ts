import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useCan } from "./usePermission";
import { applyScope, logScope } from "@/lib/applyScope";
import { useWorkspace } from "./useWorkspace";
import { scopeQuery } from "@/lib/workspaceScope";

export function useDashboardStats() {
  const { user } = useAuth();
  const { can, isLoading: permsLoading } = useCan();
  const { workspaceId } = useWorkspace();
  const soView = can("service_orders", "view");
  const poView = can("payment_orders", "view");
  const finView = can("financial", "view");
  const allowed = soView.allowed || poView.allowed || finView.allowed;

  return useQuery({
    queryKey: ["dashboard-stats", workspaceId, allowed, soView.scope, poView.scope, finView.scope, user?.id],
    enabled: !permsLoading && allowed && !!user?.id,
    queryFn: async () => {
      logScope("dashboard", "view", soView.scope, allowed);

      let soQ: any = supabase.from("service_orders").select("total, status, created_at, created_by");
      let poQ: any = supabase.from("payment_orders").select("total, status, created_at, created_by");
      let frQ: any = supabase.from("financial_records").select("amount, type, status, created_by");
      // Count assignable users (role = technician) instead of legacy `technicians` table
      const techQ = supabase.from("user_roles").select("user_id").eq("role", "technician");
      let clientQ: any = supabase.from("clients").select("id, created_by");
      const discQ = supabase.from("discrepancies").select("id, resolved");

      soQ = applyScope(soQ, soView.allowed ? soView.scope : "own", user);
      poQ = applyScope(poQ, poView.allowed ? poView.scope : "own", user);
      frQ = applyScope(frQ, finView.allowed ? finView.scope : "own", user);
      clientQ = applyScope(clientQ, soView.allowed ? soView.scope : "own", user);

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
