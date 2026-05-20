import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Phase 3 / 3B: Read-only audit log of financial events with
 * deterministic event_hash dedup and per-workspace scoping.
 */
export function useFinancialEvents(workspaceId: string | null, limit = 50) {
  return useQuery({
    queryKey: ["financial_events", workspaceId, limit],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_events" as any)
        .select(
          "id, workspace_id, event_type, entity_type, entity_id, payload, actor_user_id, created_at, event_hash, event_revision, correlation_id, caused_by_event_id"
        )
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Phase 3B: realtime de-duplication helper.
 * Returns `shouldProcess(hash)` — false when the same event_hash was already
 * processed in this tab. Use inside realtime payload handlers to ignore
 * redundant fan-outs (reconnect storms, double-subscribed channels, etc.).
 */
export function useEventDedup(capacity = 200) {
  const seen = useRef<Set<string>>(new Set());
  const order = useRef<string[]>([]);

  useEffect(() => () => {
    seen.current.clear();
    order.current = [];
  }, []);

  const shouldProcess = (hash: string | null | undefined): boolean => {
    if (!hash) return true; // no hash → cannot dedup, allow
    if (seen.current.has(hash)) return false;
    seen.current.add(hash);
    order.current.push(hash);
    if (order.current.length > capacity) {
      const evicted = order.current.shift();
      if (evicted) seen.current.delete(evicted);
    }
    return true;
  };

  return { shouldProcess };
}
