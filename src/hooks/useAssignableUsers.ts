import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface AssignableUser {
  /** auth.users.id — the canonical user id used by `assigned_user_id`. */
  user_id: string;
  /** Display name from profiles.full_name (fallback to email). */
  name: string;
  email: string | null;
  display_code: string | null;
}

/**
 * Returns the list of users assignable to a service / payment order.
 *
 * Source of truth:
 *   - `user_roles` filtered by role = 'technician' (server-side)
 *   - joined client-side with `profiles` for display data
 *
 * Admins see every technician (RLS on user_roles allows it).
 * Non-admins typically only see themselves — which is fine because the
 * UI auto-locks the field for technician users.
 *
 * NOTE: Replaces the legacy `useTechnicians()` hook. The system has fully
 * moved to `assigned_user_id` and the `technicians` table is no longer
 * referenced in any business logic.
 */
export function useAssignableUsers() {
  return useQuery({
    queryKey: ["assignable-users"],
    queryFn: async (): Promise<AssignableUser[]> => {
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "technician");
      if (roleErr) throw roleErr;

      const ids = [...new Set((roleRows ?? []).map((r) => r.user_id).filter(Boolean))] as string[];
      if (ids.length === 0) return [];

      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, display_code")
        .in("id", ids);
      if (profErr) throw profErr;

      const list: AssignableUser[] = (profiles ?? []).map((p) => ({
        user_id: p.id,
        name: (p.full_name || p.email || "—").trim(),
        email: p.email ?? null,
        display_code: (p as any).display_code ?? null,
      }));

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
 * Returns the current user's id IF they are a technician (i.e. assignable).
 * Replaces the legacy `useMyTechnicianId()` (which returned a technicians.id).
 */
export function useMyAssignableUserId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-assignable-user-id", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "technician")
        .maybeSingle();
      if (error) {
        console.error("[useMyAssignableUserId] error:", error);
        return null;
      }
      return data ? user!.id : null;
    },
  });
}
