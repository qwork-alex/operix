import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";

export type AccessMode = "full" | "readonly" | "billing_only" | "locked";

export interface WorkspaceAccessState {
  access_mode: AccessMode;
  status: string | null;
  suspension_mode: "soft" | "hard" | null;
  legal_hold: boolean;
  reasons: string[];
  can_create: boolean;
  can_edit: boolean;
  can_export: boolean;
  can_access_billing: boolean;
  trial_days_left: number | null;
  subscription_id: string | null;
  workspace_id: string | null;
}

const DEFAULT: WorkspaceAccessState = {
  access_mode: "full",
  status: null,
  suspension_mode: null,
  legal_hold: false,
  reasons: [],
  can_create: true,
  can_edit: true,
  can_export: true,
  can_access_billing: true,
  trial_days_left: null,
  subscription_id: null,
  workspace_id: null,
};

/**
 * Phase 2.5 — Centralized subscription access control.
 *
 * Backed by SQL function `public.get_workspace_access_state(ws)`.
 * Returns the authoritative `can_create / can_edit / can_export`
 * envelope for the current workspace based on subscription status,
 * suspension mode and legal hold.
 */
export function useWorkspaceAccess() {
  const { workspaceId } = useWorkspace();

  const query = useQuery({
    queryKey: ["workspace-access-state", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceAccessState> => {
      const { data, error } = await supabase.rpc("get_workspace_access_state" as any, {
        _workspace_id: workspaceId,
      } as any);
      if (error) {
        console.error("[useWorkspaceAccess]", error);
        return DEFAULT;
      }
      return (data as unknown as WorkspaceAccessState) ?? DEFAULT;
    },
  });

  const state = query.data ?? DEFAULT;
  return {
    ...state,
    isLoading: query.isLoading,
    refetch: query.refetch,
    // Convenience helpers — never call these for billing pages themselves.
    enforce: (action: "create" | "edit" | "export"): { allowed: boolean; reason: string | null } => {
      if (action === "create" && !state.can_create) return { allowed: false, reason: state.reasons[0] ?? "blocked" };
      if (action === "edit"   && !state.can_edit)   return { allowed: false, reason: state.reasons[0] ?? "blocked" };
      if (action === "export" && !state.can_export) return { allowed: false, reason: state.reasons[0] ?? "blocked" };
      return { allowed: true, reason: null };
    },
  };
}
