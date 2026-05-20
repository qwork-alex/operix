import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Phase 3: Read-only audit log of financial events.
 * Events are emitted by DB triggers when billing invoices change,
 * propagate to OPs/SOs, or update Financial Received.
 */
export function useFinancialEvents(workspaceId: string | null, limit = 50) {
  return useQuery({
    queryKey: ["financial_events", workspaceId, limit],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_events" as any)
        .select("id, workspace_id, event_type, entity_type, entity_id, payload, actor_user_id, created_at")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}
