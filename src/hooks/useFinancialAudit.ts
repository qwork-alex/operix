import { useQuery } from "@tanstack/react-query";
import { getAuditTimeline, getAuditIntegritySummary, getParticipationDiffs } from "@/lib/apiFinance";
import { useWorkspace } from "@/hooks/useWorkspace";

/**
 * Phase 4.5 — Financial Observability & Audit Layer (read-only).
 * All hooks here are SELECT-only; no mutation paths.
 * Fase 2 (onda 2): migrado do Supabase para as rotas REST /api/finance/audit/*.
 */

export interface TimelineFilters {
  year?: number | null;
  eventType?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  hash?: string | null;
  limit?: number;
}

export function useFinancialEventTimeline(filters: TimelineFilters = {}) {
  const { workspaceId: currentWorkspaceId } = useWorkspace();
  const { year, eventType, entityType, hash, limit = 200 } = filters;

  return useQuery({
    queryKey: [
      "financial_event_timeline",
      currentWorkspaceId,
      year, eventType, entityType, hash, limit,
    ],
    enabled: !!currentWorkspaceId,
    retry: 0,
    queryFn: async () => {
      const data = await getAuditTimeline({ year, eventType, entityType, hash, limit });
      return (data ?? []) as any[];
    },
  });
}

export function useFinancialIntegritySummary() {
  const { workspaceId: currentWorkspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["financial_integrity_summary", currentWorkspaceId],
    enabled: !!currentWorkspaceId,
    retry: 0,
    queryFn: async () => {
      const data = await getAuditIntegritySummary();
      return (data ?? {
        workspace_id: currentWorkspaceId,
        duplicate_hash_count: 0,
        orphan_op_count: 0,
        missing_so_links: 0,
        over_allocated_distributions: 0,
        invalid_workspace_rows: 0,
        replay_collapses: 0,
        skipped_diff_updates: 0,
        financial_sync_lock_hits: 0,
      }) as any;
    },
  });
}

export function useParticipationDiffs(ledgerId?: string | null, limit = 100) {
  const { workspaceId: currentWorkspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["participation_diffs", currentWorkspaceId, ledgerId, limit],
    enabled: !!currentWorkspaceId,
    retry: 0,
    queryFn: async () => {
      const data = await getParticipationDiffs();
      return (data ?? []) as any[];
    },
  });
}
