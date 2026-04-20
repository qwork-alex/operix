import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useRole } from "./useRole";

/**
 * Permission key format: "module.action"
 * Examples: "service_orders.view", "financial.create", "documents.delete"
 *
 * Resolution order — MUST mirror DB function public.has_permission():
 *  1. Admin → always allow
 *  2. user_permissions override (allow=true|false) → use it
 *  3. role_permissions for user's role → use it
 *  4. Default DENY (fail-safe)
 *
 * Canonical module names: dashboard, service_orders, payment_orders,
 *   financial, profit, accounting, fleet, documents, users, settings.
 * Canonical actions: view, create, edit, delete.
 */

const DEBUG = import.meta.env.DEV;

const PERMS_QUERY_KEY = ["my-permissions"] as const;

/**
 * Loads the full permissions catalog + role defaults + user overrides
 * and resolves them client-side using the EXACT same priority as the DB.
 * Cached per user+role; invalidate via `invalidateMyPermissions()` after edits.
 */
function useMyPermissionsMap() {
  const { user } = useAuth();
  const { dbRole, isAdmin, isLoading: roleLoading } = useRole();
  const qc = useQueryClient();

  // Realtime: invalidate cache when role/user permissions change anywhere.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`perms-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_permissions", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: PERMS_QUERY_KEY }))
      .on("postgres_changes", { event: "*", schema: "public", table: "role_permissions" },
        () => qc.invalidateQueries({ queryKey: PERMS_QUERY_KEY }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

  return useQuery({
    queryKey: [...PERMS_QUERY_KEY, user?.id, dbRole],
    enabled: !!user?.id && !roleLoading,
    staleTime: 30_000,
    queryFn: async (): Promise<{ admin: boolean; map: Record<string, { allowed: boolean; source: "admin" | "override" | "role" | "default-deny" }> }> => {
      if (!user?.id) return { admin: false, map: {} };
      if (isAdmin) return { admin: true, map: {} };

      const [permsRes, rolePermsRes, userPermsRes] = await Promise.all([
        supabase.from("permissions").select("id, module, action"),
        dbRole
          ? supabase.from("role_permissions").select("permission_id").eq("role", dbRole)
          : Promise.resolve({ data: [], error: null } as any),
        supabase.from("user_permissions").select("permission_id, allow").eq("user_id", user.id),
      ]);

      if (permsRes.error) {
        if (DEBUG) console.error("[usePermission] permissions catalog fetch error", permsRes.error);
        return { admin: false, map: {} };
      }

      const perms = permsRes.data ?? [];
      const rolePermIds = new Set((rolePermsRes.data ?? []).map((r: any) => r.permission_id as string));
      const overrides = new Map<string, boolean>(
        (userPermsRes.data ?? []).map((u: any) => [u.permission_id as string, u.allow as boolean]),
      );

      const map: Record<string, { allowed: boolean; source: "admin" | "override" | "role" | "default-deny" }> = {};
      for (const p of perms) {
        const key = `${p.module}.${p.action}`;
        if (overrides.has(p.id)) {
          map[key] = { allowed: overrides.get(p.id) === true, source: "override" };
        } else if (rolePermIds.has(p.id)) {
          map[key] = { allowed: true, source: "role" };
        } else {
          map[key] = { allowed: false, source: "default-deny" };
        }
      }
      return { admin: false, map };
    },
  });
}

/** Manually invalidate the permissions cache (call after toggling perms in UI). */
export function useInvalidatePermissions() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: PERMS_QUERY_KEY });
}

export function usePermission(key: string): { allowed: boolean; isLoading: boolean } {
  const { isAdmin } = useRole();
  const { data, isLoading } = useMyPermissionsMap();

  if (isAdmin) {
    if (DEBUG) {
      const [module, action] = key.split(".");
      console.log("[Permission]", { module, action, userPermission: null, rolePermission: null, finalResult: true, source: "admin" });
    }
    return { allowed: true, isLoading: false };
  }

  if (isLoading || !data) return { allowed: false, isLoading: true };
  if (data.admin) return { allowed: true, isLoading: false };

  const entry = data.map[key];
  const allowed = entry?.allowed === true;

  if (DEBUG) {
    const [module, action] = key.split(".");
    console.log("[Permission]", {
      module,
      action,
      userPermission: entry?.source === "override" ? allowed : null,
      rolePermission: entry?.source === "role" ? true : null,
      finalResult: allowed,
      source: entry?.source ?? "missing-key",
    });
  }

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
  if (isLoading || !data) return { allowed: false, isLoading: true, map: {} };
  if (data.admin) {
    const map = Object.fromEntries(keys.map((k) => [k, true]));
    return { allowed: true, isLoading: false, map };
  }
  const map = Object.fromEntries(keys.map((k) => [k, data.map[k]?.allowed === true]));
  const allowed = keys.every((k) => map[k]);
  return { allowed, isLoading: false, map };
}
