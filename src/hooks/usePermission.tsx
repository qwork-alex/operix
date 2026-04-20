import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useRole } from "./useRole";

/**
 * Permission key format: "module.action"
 * Examples: "service_orders.view", "financial.create", "documents.delete"
 *
 * Resolution order (matches DB has_permission function):
 *  1. Admin → always allow
 *  2. user_permissions override → allow/deny
 *  3. role_permissions for user's role
 *  4. Default DENY (fail-safe)
 */

const DEBUG = import.meta.env.DEV;

interface PermissionRow {
  module: string;
  action: string;
  allow?: boolean;
  source: "role" | "override";
}

/** Loads ALL effective permissions for the current user once, caches in React Query. */
function useMyPermissionsMap() {
  const { user } = useAuth();
  const { dbRole, isAdmin, isLoading: roleLoading } = useRole();

  return useQuery({
    queryKey: ["my-permissions", user?.id, dbRole],
    enabled: !!user?.id && !roleLoading,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, boolean>> => {
      if (!user?.id) return {};
      // Admin shortcut — bypass everything
      if (isAdmin) return { __admin: true };

      // Fetch permissions catalog + role defaults + user overrides in parallel
      const [permsRes, rolePermsRes, userPermsRes] = await Promise.all([
        supabase.from("permissions").select("id, module, action"),
        dbRole
          ? supabase.from("role_permissions").select("permission_id").eq("role", dbRole)
          : Promise.resolve({ data: [], error: null } as any),
        supabase.from("user_permissions").select("permission_id, allow").eq("user_id", user.id),
      ]);

      if (permsRes.error) {
        if (DEBUG) console.error("[usePermission] permissions fetch error", permsRes.error);
        return {};
      }

      const perms = permsRes.data ?? [];
      const rolePermIds = new Set((rolePermsRes.data ?? []).map((r: any) => r.permission_id));
      const overrides = new Map<string, boolean>(
        (userPermsRes.data ?? []).map((u: any) => [u.permission_id as string, u.allow as boolean]),
      );

      const map: Record<string, boolean> = {};
      for (const p of perms) {
        const key = `${p.module}.${p.action}`;
        if (overrides.has(p.id)) {
          map[key] = overrides.get(p.id) === true;
        } else {
          map[key] = rolePermIds.has(p.id);
        }
      }
      return map;
    },
  });
}

export function usePermission(key: string): { allowed: boolean; isLoading: boolean } {
  const { isAdmin } = useRole();
  const { data, isLoading } = useMyPermissionsMap();

  if (isAdmin) {
    if (DEBUG) console.log("[Permission]", { key, result: true, reason: "admin" });
    return { allowed: true, isLoading: false };
  }

  if (isLoading || !data) {
    return { allowed: false, isLoading: true };
  }

  if ((data as any).__admin) {
    return { allowed: true, isLoading: false };
  }

  // Fail-safe: missing key in map → DENY
  const allowed = data[key] === true;
  if (DEBUG) console.log("[Permission]", { key, result: allowed });
  return { allowed, isLoading: false };
}

/** Bulk check: returns true only if ALL keys are allowed. */
export function usePermissions(keys: string[]): { allowed: boolean; isLoading: boolean; map: Record<string, boolean> } {
  const { isAdmin } = useRole();
  const { data, isLoading } = useMyPermissionsMap();

  if (isAdmin) {
    const map = Object.fromEntries(keys.map((k) => [k, true]));
    return { allowed: true, isLoading: false, map };
  }
  if (isLoading || !data) {
    return { allowed: false, isLoading: true, map: {} };
  }
  if ((data as any).__admin) {
    const map = Object.fromEntries(keys.map((k) => [k, true]));
    return { allowed: true, isLoading: false, map };
  }
  const map = Object.fromEntries(keys.map((k) => [k, data[k] === true]));
  const allowed = keys.every((k) => map[k]);
  return { allowed, isLoading: false, map };
}
