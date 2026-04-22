/**
 * Data Security Layer — applyScope()
 *
 * Applies a permission scope ('own' | 'team' | 'all') to a Supabase query
 * builder so that the rows returned match what the user is allowed to see.
 *
 * Ownership column defaults to `created_by` (the convention used by all
 * business tables in this project: service_orders, payment_orders,
 * financial_records, documents, etc.). Pass `ownerColumn` for tables
 * that use a different column (e.g. `user_id`, `uploaded_by`).
 *
 * Scope semantics:
 *   - 'all'  → no filter (full table)
 *   - 'team' → rows whose owner is in user.teamIds (falls back to own)
 *   - 'own'  → only rows owned by the current user
 *   - null/unknown → fail-safe to 'own'
 */

export type ScopeUser = {
  id: string;
  teamIds?: string[] | null;
};

export type Scope = "own" | "team" | "all" | null | undefined;

const DEBUG = import.meta.env.DEV;

export function applyScope<Q extends { eq: (c: string, v: any) => Q; in: (c: string, v: any[]) => Q }>(
  query: Q,
  scope: Scope,
  user: ScopeUser | null | undefined,
  ownerColumn: string = "created_by",
): Q {
  // Hard block — no user means no data
  if (!user?.id) {
    if (DEBUG) console.log("[SCOPE] no-user → forcing impossible filter");
    return query.eq(ownerColumn, "00000000-0000-0000-0000-000000000000");
  }

  if (scope === "all") return query;

  if (scope === "team") {
    const ids = user.teamIds && user.teamIds.length > 0 ? user.teamIds : [user.id];
    return query.in(ownerColumn, ids);
  }

  // 'own' or null/undefined → fail-safe to own
  return query.eq(ownerColumn, user.id);
}

export function logScope(module: string, action: string, scope: Scope, allowed: boolean) {
  if (DEBUG) console.log("[SCOPE]", module, action, { allowed, scope });
}
