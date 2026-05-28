import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { RealtimeHub } from "@/lib/realtime/RealtimeHub";

export interface OperationalKpis {
  platformsActive: number;
  platformsInactive: number;
  /** @deprecated kept for back-compat; new UI uses platformsInactive */
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
        supabase.from("platforms").select("id,state").eq("workspace_id", workspaceId!),
        supabase.from("ai_alerts").select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!).neq("status", "resolved"),
        supabase.from("backend_event_logs").select("id", { count: "exact", head: true })
          .gte("created_at", since),
        supabase.from("service_orders")
          .select("assigned_user_id, client_id, status, platform_id")
          .eq("workspace_id", workspaceId!)
          .in("status", ["pending", "in_progress", "open"]),
      ]);

      const platforms = (plat.data ?? []) as Array<{ id: string; state: string }>;
      const openRows = (so.data ?? []) as Array<{ assigned_user_id?: string; client_id?: string; platform_id?: string | null }>;

      // Derived: a platform counts as ACTIVE if it has open OS OR its operational state === 'active'
      const platformsWithOpenOS = new Set<string>();
      const techSet = new Set<string>();
      const cliSet = new Set<string>();
      for (const r of openRows) {
        if (r.platform_id) platformsWithOpenOS.add(r.platform_id);
        if (r.assigned_user_id) techSet.add(r.assigned_user_id);
        if (r.client_id) cliSet.add(r.client_id);
      }

      const activeIds = new Set<string>();
      for (const p of platforms) {
        if (p.state === "active" || platformsWithOpenOS.has(p.id)) activeIds.add(p.id);
      }
      const platformsActive = activeIds.size;
      const platformsInactive = Math.max(0, platforms.length - platformsActive);
      const platformsDegraded = platforms.filter((p) => p.state === "degraded").length;

      return {
        platformsActive,
        platformsInactive,
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
