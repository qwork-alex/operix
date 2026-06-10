import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "./useAuth";
import { useImpersonation } from "./useImpersonation";

/**
 * UserContext — single source of truth for identity, role, workspace and ownership.
 *
 * Backed by the SQL function `public.get_user_context()` (Phase 1, parallel layer).
 * DO NOT replace useAuth/useRole with this yet — this hook is opt-in until Phase 2
 * of the migration plan (see `.lovable/plan.md`).
 */

export interface UserContext {
  auth_user_id: string | null;
  app_user_id: string | null;
  email: string | null;
  is_active: boolean;
  is_system_owner: boolean;
  primary_role: "admin" | "socio" | "tecnico" | "cliente" | null;
  primary_db_role: "admin" | "partner" | "technician" | "client" | null;
  secondary_roles: string[];
  current_workspace_id: string | null;
  workspace_ids: string[];
  membership_role: string | null;
  effective_role: string | null;
  can_manage_all: boolean;
  can_view_all_workspace: boolean;
  ownership: {
    technician_id: string | null;
    owns_filter_uids: string[];
  };
  flags: {
    is_admin: boolean;
    is_partner: boolean;
    is_technician: boolean;
    is_client: boolean;
    is_impersonating: boolean;
  };
  computed_at: string;
}

export function useUserContext() {
  const { user } = useAuth();
  const { effectiveUserId, isImpersonating } = useImpersonation();

  const query = useQuery({
    queryKey: ["user-context", user?.id, effectiveUserId, isImpersonating],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<UserContext | null> => {
      try {
        const suffix =
          effectiveUserId && effectiveUserId !== user?.id
            ? `?userId=${encodeURIComponent(effectiveUserId)}`
            : "";
        const data = await apiRequest<{ context: UserContext | null }>(`/account/context${suffix}`);
        const ctx = data.context;
        if (ctx && ctx.flags) {
          ctx.flags.is_impersonating = !!isImpersonating;
        }
        return ctx;
      } catch (error) {
        console.error("[useUserContext] error:", error);
        return null;
      }
    },
  });

  return {
    ctx: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
