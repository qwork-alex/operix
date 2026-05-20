import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { ModuleAccessMap } from "@/lib/workspaceScope";
import {
  canAccessModuleInWorkspace,
  resolveAggregatedModuleAccess,
} from "@/lib/workspaceScope";

/**
 * useWorkspaceModules — Phase 1 of the Workspace Context Engine.
 *
 * Reads per-workspace module flags from `workspace_module_permissions`
 * for every workspace the current user belongs to. Returns helpers to:
 *  - check if a module is enabled in a specific workspace
 *  - check if at least one workspace grants the module (for menu visibility)
 *
 * Default: a module is enabled unless explicitly disabled.
 */
export interface WorkspaceModulesContext {
  modulesByWorkspace: Record<string, ModuleAccessMap>;
  workspaceIds: string[];
  isLoading: boolean;
  canAccessModule: (workspaceId: string | null, module: string) => boolean;
  canAccessAnyWorkspaceModule: (module: string) => boolean;
}

export function useWorkspaceModules(): WorkspaceModulesContext {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["workspace-module-permissions", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: wsRows, error: wsErr } = await supabase.rpc(
        "get_user_workspaces",
        { _uid: user!.id } as never,
      );
      if (wsErr) throw wsErr;

      const wsIds = (wsRows as any[] | null)?.map((r) => r.workspace_id) ?? [];
      if (wsIds.length === 0) {
        return { modulesByWorkspace: {} as Record<string, ModuleAccessMap>, workspaceIds: [] };
      }

      const { data: perms, error: pErr } = await supabase
        .from("workspace_module_permissions" as any)
        .select("workspace_id, module, enabled")
        .in("workspace_id", wsIds);
      if (pErr) throw pErr;

      const map: Record<string, ModuleAccessMap> = {};
      for (const id of wsIds) map[id] = {};
      for (const row of (perms as any[]) || []) {
        if (!map[row.workspace_id]) map[row.workspace_id] = {};
        map[row.workspace_id][row.module] = !!row.enabled;
      }

      return { modulesByWorkspace: map, workspaceIds: wsIds };
    },
  });

  const modulesByWorkspace = query.data?.modulesByWorkspace ?? {};
  const workspaceIds = query.data?.workspaceIds ?? [];

  return {
    modulesByWorkspace,
    workspaceIds,
    isLoading: query.isLoading,
    canAccessModule: (wsId, module) =>
      canAccessModuleInWorkspace(modulesByWorkspace, wsId, module),
    canAccessAnyWorkspaceModule: (module) =>
      resolveAggregatedModuleAccess(modulesByWorkspace, module),
  };
}
