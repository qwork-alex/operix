import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useRole } from "./useRole";

/**
 * Permission key format: "module.action"
 *
 * Resolution order — MUST mirror DB function public.has_permission():
 *  1. Admin → always allow, scope = 'all'
 *  2. user_permissions override (allow=true|false, scope) → use it
 *  3. role_permissions for user's role (allow, scope) → use it
 *  4. Default DENY (fail-safe), scope = null
 *
 * Scope values: 'own' | 'team' | 'all'.
 * Backward compatibility: missing scope is treated as 'all'.
 */

export type PermissionScope = "own" | "team" | "all";
export type PermissionResult = { allowed: boolean; scope: PermissionScope | null };

const DEBUG = import.meta.env.DEV;
const PERMS_QUERY_KEY = ["my-permissions"] as const;

type Source = "admin" | "override" | "role" | "default-deny";
type Entry = { allowed: boolean; scope: PermissionScope | null; source: Source };

function normalizeScope(s: unknown): PermissionScope {
  return s === "own" || s === "team" || s === "all" ? s : "all";
}

function useMyPermissionsMap() {
  const { user } = useAuth();
  const { dbRole, isAdmin, isLoading: roleLoading } = useRole();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;
    const channelName = `perms-${user.id}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
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
    queryFn: async (): Promise<{ admin: boolean; map: Record<string, Entry> }> => {
      if (!user?.id) return { admin: false, map: {} };
      if (isAdmin) return { admin: true, map: {} };

      const [permsRes, rolePermsRes, userPermsRes] = await Promise.all([
        supabase.from("permissions").select("id, module, action"),
        dbRole
          ? supabase.from("role_permissions").select("permission_id, scope").eq("role", dbRole)
          : Promise.resolve({ data: [], error: null } as any),
        supabase.from("user_permissions").select("permission_id, allow, scope").eq("user_id", user.id),
      ]);

      if (permsRes.error) {
        if (DEBUG) console.error("[usePermission] permissions catalog fetch error", permsRes.error);
        return { admin: false, map: {} };
      }

      const perms = permsRes.data ?? [];

      // role: permission_id -> scope
      const rolePerms = new Map<string, PermissionScope>();
      for (const r of (rolePermsRes.data ?? []) as Array<{ permission_id: string; scope?: PermissionScope | null }>) {
        rolePerms.set(r.permission_id, normalizeScope(r.scope));
      }

      // user override: permission_id -> { allow, scope } (last write wins for dups)
      const overrides = new Map<string, { allow: boolean; scope: PermissionScope }>();
      for (const u of (userPermsRes.data ?? []) as Array<{ permission_id: string; allow: boolean; scope?: PermissionScope | null }>) {
        overrides.set(u.permission_id, { allow: u.allow === true, scope: normalizeScope(u.scope) });
      }

      const map: Record<string, Entry> = {};
      for (const p of perms) {
        const key = `${p.module}.${p.action}`;
        const ov = overrides.get(p.id);
        if (ov) {
          map[key] = { allowed: ov.allow, scope: ov.allow ? ov.scope : null, source: "override" };
        } else if (rolePerms.has(p.id)) {
          map[key] = { allowed: true, scope: rolePerms.get(p.id)!, source: "role" };
        } else {
          map[key] = { allowed: false, scope: null, source: "default-deny" };
        }
        if (DEBUG) console.log("[Permission:resolve]", { key, ...map[key] });
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

  if (isAdmin) return { allowed: true, isLoading: false };
  if (isLoading || !data) return { allowed: false, isLoading: true };
  if (data.admin) return { allowed: true, isLoading: false };

  return { allowed: data.map[key]?.allowed === true, isLoading: false };
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
  return { allowed: keys.every((k) => map[k]), isLoading: false, map };
}

/**
 * SINGLE SOURCE OF TRUTH — `can(module, action)` resolver.
 *
 * Returns a `PermissionResult` object: `{ allowed, scope }`.
 *
 * BACKWARD COMPATIBILITY:
 * The returned object is also truthy when `allowed === true`, so any legacy
 * `if (can(m, a))` check still works because the object itself is truthy.
 * Prefer `can(m, a).allowed` going forward.
 */
export function useCan(): {
  can: (module: string, action: string) => PermissionResult;
  isLoading: boolean;
} {
  const { isAdmin } = useRole();
  const { data, isLoading } = useMyPermissionsMap();

  const can = (module: string, action: string): PermissionResult => {
    if (isAdmin) return { allowed: true, scope: "all" };
    if (!data) return { allowed: false, scope: null };
    if (data.admin) return { allowed: true, scope: "all" };
    const entry = data.map?.[`${module}.${action}`];
    if (!entry || !entry.allowed) return { allowed: false, scope: null };
    return { allowed: true, scope: entry.scope ?? "all" };
  };

  return { can, isLoading: isLoading && !isAdmin };
}
