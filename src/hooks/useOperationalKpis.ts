import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { RealtimeHub } from "@/lib/realtime/RealtimeHub";
import { withAbortableTimeout, withPromiseTimeout } from "@/lib/asyncGuard";

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
    retry: 0,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? {
      platformsActive: 0,
      platformsInactive: 0,
      platformsDegraded: 0,
      alerts: 0,
      realtimeEvents24h: 0,
      activeTechnicians: 0,
      activeClients: 0,
    },
    queryFn: async (): Promise<OperationalKpis> => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      // #region debug-point E:operational-kpis-start
      void fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "route-loading-stall",
          runId: "pre-fix",
          hypothesisId: "E",
          location: "src/hooks/useOperationalKpis.ts:query:start",
          msg: "[DEBUG] DATA_START",
          data: { source: "operational-kpis", workspaceId },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      try {
        const [plat, alerts, events, so] = await withPromiseTimeout(Promise.all([
          withAbortableTimeout(async (signal) => ((supabase.from("platforms").select("id,state").eq("workspace_id", workspaceId!)) as any).abortSignal(signal), 10000, "operational_kpis_platforms"),
          withAbortableTimeout(async (signal) => ((supabase.from("ai_alerts").select("id", { count: "exact", head: true })
            .eq("workspace_id", workspaceId!).neq("status", "resolved")) as any).abortSignal(signal), 10000, "operational_kpis_alerts"),
          withAbortableTimeout(async (signal) => ((supabase.from("backend_event_logs").select("id", { count: "exact", head: true })
            .gte("created_at", since)) as any).abortSignal(signal), 10000, "operational_kpis_events"),
          withAbortableTimeout(async (signal) => ((supabase.from("service_orders")
            .select("assigned_user_id, client_id, status, platform_id")
            .eq("workspace_id", workspaceId!)
            .in("status", ["pending", "in_progress", "open"])) as any).abortSignal(signal), 10000, "operational_kpis_service_orders"),
        ]), 10000, "operational_kpis");

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

        // #region debug-point E:operational-kpis-success
        void fetch("http://127.0.0.1:7777/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "route-loading-stall",
            runId: "pre-fix",
            hypothesisId: "E",
            location: "src/hooks/useOperationalKpis.ts:query:success",
            msg: "[DEBUG] DATA_SUCCESS",
            data: {
              source: "operational-kpis",
              workspaceId,
              platforms: platforms.length,
              openServiceOrders: openRows.length,
            },
            ts: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        return {
          platformsActive,
          platformsInactive,
          platformsDegraded,
          alerts: alerts.count ?? 0,
          realtimeEvents24h: events.count ?? 0,
          activeTechnicians: techSet.size,
          activeClients: cliSet.size,
        };
      } catch (error) {
        // #region debug-point E:operational-kpis-error
        void fetch("http://127.0.0.1:7777/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "route-loading-stall",
            runId: "pre-fix",
            hypothesisId: "E",
            location: "src/hooks/useOperationalKpis.ts:query:error",
            msg: "[DEBUG] DATA_ERROR",
            data: {
              source: "operational-kpis",
              workspaceId,
              error: error instanceof Error ? error.message : String(error),
            },
            ts: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        throw error;
      }
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
