import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";

/**
 * Phase 4.5 — Financial Observability & Audit Layer (read-only).
 * All hooks here are SELECT-only; no mutation paths.
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
  const { year, eventType, entityType, entityId, hash, limit = 200 } = filters;

  return useQuery({
    queryKey: [
      "financial_event_timeline",
      currentWorkspaceId,
      year, eventType, entityType, entityId, hash, limit,
    ],
    enabled: !!currentWorkspaceId,
    queryFn: async () => {
      let q = supabase
        .from("financial_event_timeline_v" as any)
        .select("*")
        .eq("workspace_id", currentWorkspaceId!)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (year) q = q.eq("year_reference", year);
      if (eventType) q = q.eq("event_type", eventType);
      if (entityType) q = q.eq("entity_type", entityType);
      if (entityId) q = q.eq("entity_id", entityId);
      if (hash) q = q.eq("event_hash", hash);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useFinancialIntegritySummary() {
  const { workspaceId: currentWorkspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["financial_integrity_summary", currentWorkspaceId],
    enabled: !!currentWorkspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_financial_integrity_summary" as any)
        .select("*")
        .eq("workspace_id", currentWorkspaceId!)
        .maybeSingle();
      if (error) throw error;
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
    queryFn: async () => {
      let q = supabase
        .from("participation_diffs" as any)
        .select("*")
        .eq("workspace_id", currentWorkspaceId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (ledgerId) q = q.eq("ledger_id", ledgerId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
