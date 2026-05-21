import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";
import { toast } from "sonner";

/** Platform-wide smart metrics: MRR / ARR / churn / retention / projected. */
export function usePlatformSmartMetrics() {
  return useQuery({
    queryKey: ["platform-smart-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_platform_smart_metrics" as any);
      if (error) throw error;
      return (data ?? {}) as Record<string, any>;
    },
    refetchInterval: 60_000,
  });
}

/** Per-workspace billing intelligence (churn risk, downgrade, growth anomaly). */
export function useBillingIntelligence(workspaceIdOverride?: string | null) {
  const { workspaceId: ctxId } = useWorkspace();
  const workspaceId = workspaceIdOverride ?? ctxId;
  return useQuery({
    queryKey: ["billing-intelligence", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_billing_intelligence" as any, {
        _workspace_id: workspaceId!,
      });
      if (error) throw error;
      return (data ?? {}) as Record<string, any>;
    },
  });
}

/** Owner-only: trigger the master automation runner manually. */
export function useRunAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("run_subscription_automation" as any);
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success("Automação executada", {
        description: `Renovações: ${data?.renewals?.processed ?? 0} · Retries: ${data?.retries?.processed ?? 0} · Transições: ${data?.transitions?.transitions ?? 0}`,
      });
      qc.invalidateQueries({ queryKey: ["platform-smart-metrics"] });
      qc.invalidateQueries({ queryKey: ["platform-subscriptions-overview"] });
      qc.invalidateQueries({ queryKey: ["subscription-events"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro a correr automação"),
  });
}
