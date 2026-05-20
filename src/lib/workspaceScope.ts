/**
 * Workspace Scope Helpers — Phase 1 (opt-in, non-breaking)
 *
 * Provides utilities to scope Supabase queries by workspace_id when the
 * column exists. Existing hooks remain untouched; new code (or refactors)
 * can adopt these helpers gradually.
 *
 * Tables known to have `workspace_id` after the Phase 1 migration:
 */
export const WORKSPACE_SCOPED_TABLES = new Set<string>([
  "app_users",
  "documents",
  "invites",
  "memberships",
  "service_orders",
  "technicians",
  // Added in Phase 1:
  "payment_orders",
  "financial_records",
  "billing_invoices",
  "billing_payments",
  "billing_clients",
  "billing_suppliers",
  "billing_attachments",
  "billing_reconciliations",
  "clients",
  "notifications",
  "fleet_trips",
  "fleet_fuel_logs",
  "drivers",
  "hail_reports",
  "discrepancies",
]);

export function tableHasWorkspaceId(table: string): boolean {
  return WORKSPACE_SCOPED_TABLES.has(table);
}

/**
 * Apply an `.eq('workspace_id', wsId)` filter to a Supabase query builder
 * when the target table is workspace-scoped. No-op if wsId is null or the
 * table doesn't carry workspace_id yet (backward compat).
 */
export function scopeQuery<Q = any>(
  query: Q,
  table: string,
  workspaceId: string | null | undefined,
): Q {
  if (!workspaceId) return query;
  if (!tableHasWorkspaceId(table)) return query;
  return (query as any).eq("workspace_id", workspaceId) as Q;
}

/**
 * Aggregate module-access across all workspaces the user belongs to.
 * A module is visible in the sidebar if ANY workspace grants it.
 */
export type ModuleAccessMap = Record<string, boolean>;

export function resolveAggregatedModuleAccess(
  modulesByWorkspace: Record<string, ModuleAccessMap>,
  module: string,
): boolean {
  for (const wsId in modulesByWorkspace) {
    if (modulesByWorkspace[wsId]?.[module] !== false) {
      // default = enabled unless explicitly false
      return true;
    }
  }
  return Object.keys(modulesByWorkspace).length === 0; // no workspaces? hide
}

export function canAccessModuleInWorkspace(
  modulesByWorkspace: Record<string, ModuleAccessMap>,
  workspaceId: string | null | undefined,
  module: string,
): boolean {
  if (!workspaceId) return false;
  const map = modulesByWorkspace[workspaceId];
  if (!map) return true; // no overrides recorded => default enabled
  return map[module] !== false;
}
