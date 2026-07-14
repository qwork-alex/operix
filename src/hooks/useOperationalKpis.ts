import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { withPromiseTimeout } from "@/lib/asyncGuard";

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
      const [platData, eventsData, soData] = await withPromiseTimeout(Promise.all([
        apiRequest<{ platforms: any[] }>(`/platforms?workspace_id=${workspaceId}`),
        apiRequest<{ count: number }>(`/weather/backend-events?count=true&since=${since}`),
        apiRequest<{ orders: any[] }>(`/service-orders?workspace_id=${workspaceId}&limit=500`),
      ]), 15000, "operational_kpis");

      const platforms = platData.platforms ?? [];
      const openRows = (soData.orders ?? []).filter((o: any) => ["pending","in_progress","open"].includes(o.status));
      const platformsWithOpenOS = new Set<string>();
      const techSet = new Set<string>(), cliSet = new Set<string>();
      for (const r of openRows) {
        if (r.platform_id) platformsWithOpenOS.add(r.platform_id);
        if (r.assigned_user_id) techSet.add(r.assigned_user_id);
        if (r.client_id) cliSet.add(r.client_id);
      }
      const activeIds = new Set<string>();
      for (const p of platforms) { if (p.state === "active" || platformsWithOpenOS.has(p.id)) activeIds.add(p.id); }
      const platformsActive = activeIds.size;
      const platformsInactive = Math.max(0, platforms.length - platformsActive);
      const platformsDegraded = platforms.filter((p: any) => p.state === "degraded").length;
      return { platformsActive, platformsInactive, platformsDegraded, alerts: 0, realtimeEvents24h: eventsData.count ?? 0, activeTechnicians: techSet.size, activeClients: cliSet.size };
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!workspaceId) return;
    const id = setInterval(() => qc.invalidateQueries({ queryKey: ["operational-kpis", workspaceId] }), 30000);
    return () => clearInterval(id);
  }, [workspaceId, qc]);

  return query;
}
