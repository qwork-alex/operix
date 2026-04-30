import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useWorkspace } from "./useWorkspace";

/** Safe wrapper: returns null workspaceId when no WorkspaceProvider is mounted. */
function useOptionalWorkspaceId(): string | null {
  try {
    return useWorkspace().workspaceId;
  } catch {
    return null;
  }
}

export interface AssignableUser {
  /** auth.users.id — the canonical user id used by `assigned_user_id`. */
  user_id: string;
  /** Display name from app_users.name (fallback to email). */
  name: string;
  email: string | null;
  display_code: string | null;
}

/**
 * Returns the list of users assignable to a service / payment order.
 *
 * Source of truth: `app_users`, scoped to the current workspace.
 * Always includes the current user (so technicians can self-assign).
 *
 * NOTE: replaces the legacy `useTechnicians()` hook. The system has fully
 * moved to `assigned_user_id` (auth.users.id) and the `technicians` table
 * is no longer referenced in any business logic.
 */
export function useAssignableUsers() {
  const { user } = useAuth();
  const workspaceId = useOptionalWorkspaceId();

  return useQuery({
    queryKey: ["assignable-users", workspaceId, user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AssignableUser[]> => {
      // Pull every app_user in the current workspace. RLS allows admins to
      // see all and non-admins to see themselves — that's enough to make
      // the dropdown render the current user reliably.
      let q = supabase
        .from("app_users")
        .select("auth_user_id, name, email, workspace_id");
      if (workspaceId) q = q.eq("workspace_id", workspaceId);

      const { data, error } = await q;
      if (error) throw error;

      // Optional display_code from profiles
      const ids = [...new Set((data ?? []).map((r) => r.auth_user_id).filter(Boolean))] as string[];
      let codeMap = new Map<string, string | null>();
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_code")
          .in("id", ids);
        codeMap = new Map((profs ?? []).map((p: any) => [p.id, p.display_code ?? null]));
      }

      // Filter out deactivated (banned) users — invisible everywhere in the system.
      let activeIds = new Set<string>(ids);
      try {
        const { data: actives, error: actErr } = await supabase.rpc("active_user_ids");
        if (!actErr && Array.isArray(actives)) {
          activeIds = new Set((actives as Array<{ user_id: string }>).map((r) => r.user_id));
        }
      } catch {
        // If RPC fails, fall back to showing all (don't hide accidentally).
      }

      const list: AssignableUser[] = (data ?? [])
        .filter((r) => !!r.auth_user_id && activeIds.has(r.auth_user_id as string))
        .map((r) => ({
          user_id: r.auth_user_id as string,
          name: ((r.name || r.email || "—") as string).trim(),
          email: r.email ?? null,
          display_code: codeMap.get(r.auth_user_id as string) ?? null,
        }));

      // Guarantee the current user is always present in the dropdown.
      if (user?.id && !list.some((u) => u.user_id === user.id)) {
        list.unshift({
          user_id: user.id,
          name: user.email || "Eu",
          email: user.email ?? null,
          display_code: codeMap.get(user.id) ?? null,
        });
      }

      list.sort((a, b) => {
        const ac = a.display_code ?? "";
        const bc = b.display_code ?? "";
        if (ac && bc) return ac.localeCompare(bc);
        if (ac) return -1;
        if (bc) return 1;
        return a.name.localeCompare(b.name);
      });

      return list;
    },
  });
}

/**
 * Returns the current user's id (from supabase.auth) — used by the save
 * flow to force `assigned_user_id = auth.uid()` for non-admin users.
 */
export function useMyAssignableUserId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-assignable-user-id", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? user?.id ?? null;
    },
  });
}
