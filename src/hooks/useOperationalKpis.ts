import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { RealtimeHub } from "@/lib/realtime/RealtimeHub";

export interface OperationalKpis {
  platformsActive: number;
  platformsDegraded: number;
  alerts: number;
  realtimeEvents24h: number;
  activeTechnicians: number;
  activeClients: number;
}

export function useOperationalKpis() {
  const qc = useQueryClient();
  const { workspaceId } = useWorkspace();

  const query = useQuery({
    queryKey: ["operational-kpis", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<OperationalKpis> => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [plat, alerts, events, so] = await Promise.all([
        supabase.from("platforms").select("state").eq("workspace_id", workspaceId!),
        supabase.from("ai_alerts").select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!).neq("status", "resolved"),
        supabase.from("backend_event_logs").select("id", { count: "exact", head: true })
          .gte("created_at", since),
        supabase.from("service_orders")
          .select("assigned_user_id, client_id, status")
          .eq("workspace_id", workspaceId!)
          .in("status", ["pending", "in_progress", "open"]),
      ]);

      const platformsActive = (plat.data ?? []).filter((p: any) => p.state === "active").length;
      const platformsDegraded = (plat.data ?? []).filter((p: any) => p.state === "degraded").length;
      const techSet = new Set<string>();
      const cliSet = new Set<string>();
      for (const r of so.data ?? []) {
        if ((r as any).assigned_user_id) techSet.add((r as any).assigned_user_id);
        if ((r as any).client_id) cliSet.add((r as any).client_id);
      }

      return {
        platformsActive,
        platformsDegraded,
        alerts: alerts.count ?? 0,
        realtimeEvents24h: events.count ?? 0,
        activeTechnicians: techSet.size,
        activeClients: cliSet.size,
      };
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!workspaceId) return;
    const invalidate = () => qc.invalidateQueries({ queryKey: ["operational-kpis", workspaceId] });
    const offs = [
      RealtimeHub.subscribe({ table: "platforms", workspaceId }, invalidate),
      RealtimeHub.subscribe({ table: "ai_alerts", workspaceId }, invalidate),
      RealtimeHub.subscribe({ table: "service_orders", event: "INSERT", workspaceId }, invalidate),
    ];
    return () => { offs.forEach((off) => off()); };
  }, [workspaceId, qc]);

  return query;
}
