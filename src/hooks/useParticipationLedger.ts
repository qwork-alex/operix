import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface ParticipationSummaryRow {
  workspace_id: string | null;
  year_reference: number | null;
  participant_name: string;
  participant_type: string;
  participant_user_id: string | null;
  expected: number;
  received: number;
  pending: number;
  pending_count: number;
  partial_count: number;
  paid_count: number;
  os_count: number;
}

export interface ParticipationLedgerEntry {
  id: string;
  service_order_id: string;
  participant_name: string;
  participant_type: string;
  percentage: number;
  expected_amount: number;
  received_amount: number;
  pending_amount: number;
  status: string;
  year_reference: number | null;
  workspace_id: string | null;
}

function useSessionUserId() {
  const { user, loading } = useAuth();
  return loading ? null : user?.id ?? null;
}

export function useParticipationSummary(year?: number) {
  const uid = useSessionUserId();
  return useQuery({
    queryKey: ["participation_summary", uid, year ?? "all"],
    enabled: !!uid,
    queryFn: async () => {
      let q = supabase
        .from("v_participation_summary" as any)
        .select("*")
        .neq("participant_type", "client");
      if (year) q = q.eq("year_reference", year);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ParticipationSummaryRow[];
    },
  });
}

export function useParticipationDetail(
  participantName: string | null,
  year?: number
) {
  const uid = useSessionUserId();
  return useQuery({
    queryKey: ["participation_detail", uid, participantName, year ?? "all"],
    enabled: !!uid && !!participantName,
    queryFn: async () => {
      let q = supabase
        .from("participation_ledger" as any)
        .select("*")
        .eq("participant_name", participantName!)
        .neq("participant_type", "client")
        .order("updated_at", { ascending: false });
      if (year) q = q.eq("year_reference", year);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ParticipationLedgerEntry[];
    },
  });
}
