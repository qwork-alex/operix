import { useMemo } from "react";
import { useWorkspace } from "./useWorkspace";
import { useAuth } from "./useAuth";

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
 * Source of truth: workspace members loaded by WorkspaceProvider via REST API.
 * Always includes the current user so technicians can self-assign.
 */
export function useAssignableUsers() {
  const { members } = useWorkspace();
  const { user } = useAuth();

  const data = useMemo((): AssignableUser[] => {
    const list: AssignableUser[] = members
      .filter((m) => m.auth_user_id && m.status === "active")
      .map((m) => ({
        user_id: m.auth_user_id,
        name: (m.name ?? m.email ?? "—").trim(),
        email: m.email ?? null,
        display_code: null,
      }));

    // Guarantee the current user is always present.
    if (user?.id && !list.some((u) => u.user_id === user.id)) {
      list.unshift({
        user_id: user.id,
        name: user.email ?? "Eu",
        email: user.email ?? null,
        display_code: null,
      });
    }

    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [members, user]);

  return { data, isLoading: false, error: null };
}

/**
 * Returns the current user's auth id — used by the save flow to force
 * `assigned_user_id = auth.uid()` for non-admin users.
 */
export function useMyAssignableUserId() {
  const { user } = useAuth();
  return { data: user?.id ?? null, isLoading: false };
}
