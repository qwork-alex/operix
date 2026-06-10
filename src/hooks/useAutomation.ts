import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useWorkspace } from "./useWorkspace";
import { toast } from "sonner";

/** Platform-wide smart metrics: MRR / ARR / churn / retention / projected. */
export function usePlatformSmartMetrics() {
  return useQuery({
    queryKey: ["platform-smart-metrics"],
    queryFn: async () => apiRequest<Record<string, any>>("/billing/admin/smart-metrics"),
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
      const data = await apiRequest<{ intelligence: Record<string, any> | null }>(
        `/billing/workspaces/${workspaceId}/intelligence`,
      );
      return data.intelligence ?? {};
    },
  });
}

/** Owner-only: trigger the master automation runner manually. */
export function useRunAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => apiRequest<Record<string, any>>("/billing/admin/automation/run", {
      method: "POST",
    }),
    onSuccess: (data: any) => {
      toast.success("Automação executada", {
        description: `Renovações: ${data?.renewals?.processed ?? 0} · Retries: ${data?.retries?.processed ?? 0} · Transições: ${data?.transitions?.transitions ?? 0}`,
      });
      qc.invalidateQueries({ queryKey: ["platform-smart-metrics"] });
      qc.invalidateQueries({ queryKey: ["automation-last-run"] });
      qc.invalidateQueries({ queryKey: ["platform-subscriptions-overview"] });
      qc.invalidateQueries({ queryKey: ["billing-intelligence"] });
      qc.invalidateQueries({ queryKey: ["subscription-events"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro a correr automação"),
  });
}
