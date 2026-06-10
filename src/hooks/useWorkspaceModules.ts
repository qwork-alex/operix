import { useQuery } from "@tanstack/react-query";
import { useWorkspace, type MembershipRole } from "./useWorkspace";
import type { ModuleAccessMap } from "@/lib/workspaceScope";
import {
  canAccessModuleInWorkspace,
  resolveAggregatedModuleAccess,
} from "@/lib/workspaceScope";

/**
 * Transitional module-access layer.
 *
 * Until workspace module toggles are persisted in the new backend, every
 * workspace inherited from `/account/workspaces` is treated as fully enabled.
 * This removes the Supabase dependency without breaking menu visibility.
 */
export interface WorkspaceModulesContext {
  modulesByWorkspace: Record<string, ModuleAccessMap>;
  workspaceIds: string[];
  isLoading: boolean;
  canAccessModule: (workspaceId: string | null, module: string) => boolean;
  canAccessAnyWorkspaceModule: (module: string) => boolean;
}

type AvailableWorkspaceSummary = {
  id: string;
  name: string;
  ownerAppUserId: string | null;
  membershipRole: MembershipRole | null;
  membershipStatus: string;
};

export function useWorkspaceModules(): WorkspaceModulesContext {
  const { availableWorkspaces, isLoading: workspaceLoading } = useWorkspace();

  const query = useQuery({
    queryKey: ["workspace-module-permissions", availableWorkspaces],
    enabled: !workspaceLoading,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const wsIds = availableWorkspaces.map((workspace: AvailableWorkspaceSummary) => workspace.id);
      const map: Record<string, ModuleAccessMap> = {};

      for (const id of wsIds) {
        map[id] = {};
      }

      return { modulesByWorkspace: map, workspaceIds: wsIds };
    },
  });

  const modulesByWorkspace = query.data?.modulesByWorkspace ?? {};
  const workspaceIds = query.data?.workspaceIds ?? [];

  return {
    modulesByWorkspace,
    workspaceIds,
    isLoading: workspaceLoading || query.isLoading,
    canAccessModule: (wsId, module) =>
      canAccessModuleInWorkspace(modulesByWorkspace, wsId, module),
    canAccessAnyWorkspaceModule: (module) =>
      resolveAggregatedModuleAccess(modulesByWorkspace, module),
  };
}
