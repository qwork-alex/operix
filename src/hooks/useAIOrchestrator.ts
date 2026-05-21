import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";

export type AITask =
  | "interpret_os"
  | "suggest_assignment"
  | "detect_bottlenecks"
  | "predict_delay"
  | "fraud_score"
  | "productivity"
  | "costs"
  | "fuel"
  | "financial_behavior"
  | "score_technician"
  | "score_fleet"
  | "score_productivity"
  | "score_financial_risk";

export interface AIReasoning {
  why?: string;
  origem?: string[];
  contexto?: string;
}

export interface AIResult {
  cached: boolean;
  result: {
    summary: string;
    confidence: number;
    items: any[];
    explanation: AIReasoning;
  };
  explanation?: AIReasoning;
  confidence?: number;
}

export function useAIInference() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  return useMutation<AIResult, Error, { task: AITask; entity_id?: string; force?: boolean; persist?: boolean }>({
    mutationFn: async ({ task, entity_id, force, persist }) => {
      if (!workspaceId) throw new Error("Workspace não definido");
      const { data, error } = await supabase.functions.invoke("ai-orchestrator", {
        body: { task, workspace_id: workspaceId, entity_id, force, persist },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as AIResult;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ai-recommendations"] });
      qc.invalidateQueries({ queryKey: ["ai-insights"] });
      qc.invalidateQueries({ queryKey: ["ai-alerts"] });
      qc.invalidateQueries({ queryKey: ["ai-scores"] });
      if (!data.cached) toast.success("Inferência IA concluída");
    },
    onError: (e) => {
      const msg = e.message || "Falha na inferência";
      if (msg.includes("402")) toast.error("Créditos IA esgotados. Adicione crédito no workspace.");
      else if (msg.includes("429")) toast.error("Muitas requisições IA. Aguarde alguns segundos.");
      else toast.error(`IA: ${msg}`);
    },
  });
}

const baseListQuery = <T,>(key: string, table: string, workspaceId: string | null, filter?: (q: any) => any) =>
  ({
    queryKey: [key, workspaceId],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async (): Promise<T[]> => {
      if (!workspaceId) return [];
      let q = supabase.from(table as any).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100);
      if (filter) q = filter(q);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });

export function useAIRecommendations() {
  const { workspaceId } = useWorkspace();
  return useQuery(baseListQuery<any>("ai-recommendations", "ai_recommendations", workspaceId));
}
export function useAIInsights() {
  const { workspaceId } = useWorkspace();
  return useQuery(baseListQuery<any>("ai-insights", "ai_insights", workspaceId));
}
export function useAIAlerts() {
  const { workspaceId } = useWorkspace();
  return useQuery(baseListQuery<any>("ai-alerts", "ai_alerts", workspaceId));
}
export function useAIScores() {
  const { workspaceId } = useWorkspace();
  return useQuery(baseListQuery<any>("ai-scores", "ai_scores", workspaceId));
}
export function useAIActionLog() {
  const { workspaceId } = useWorkspace();
  return useQuery(baseListQuery<any>("ai-action-log", "ai_action_log", workspaceId));
}

export function useAIAction() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { action: string; recommendation_id?: string; alert_id?: string; payload?: any }) => {
      if (!workspaceId) throw new Error("Workspace não definido");
      const { data, error } = await supabase.functions.invoke("ai-action", {
        body: { workspace_id: workspaceId, ...payload },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-recommendations"] });
      qc.invalidateQueries({ queryKey: ["ai-alerts"] });
      qc.invalidateQueries({ queryKey: ["ai-action-log"] });
      toast.success("Ação aplicada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
