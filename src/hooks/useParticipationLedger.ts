import { useQuery } from "@tanstack/react-query";
import { getParticipationSummary, getParticipationDetail } from "@/lib/apiFinance";
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
    retry: 0,
    queryFn: async () => {
      const data = await getParticipationSummary(year);
      return (data ?? []) as ParticipationSummaryRow[];
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
    retry: 0,
    queryFn: async () => {
      const data = await getParticipationDetail(participantName!, year);
      return (data ?? []) as ParticipationLedgerEntry[];
    },
  });
}
