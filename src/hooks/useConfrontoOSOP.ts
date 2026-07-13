import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getConfrontoCandidates,
  getConfrontoHistory,
  getConfrontoPending,
  confrontoMerge,
  confrontoReject,
  confrontoValidate,
} from "@/lib/apiFinance";

export interface SORecord {
  id: string;
  license_plate: string | null;
  car_name: string | null;
  client_name: string;
  client_id: string | null;
  technician_name: string;
  assigned_user_id: string | null;
  platform: string | null;
  total: number | null;
  service_1_name: string | null;
  service_1_price: number | null;
  service_2_name: string | null;
  service_2_price: number | null;
  service_3_name: string | null;
  service_3_price: number | null;
  service_4_name: string | null;
  service_4_price: number | null;
  created_at: string;
  status: string;
}

export interface PORecord {
  id: string;
  license_plate: string | null;
  car_name: string | null;
  client_name: string | null;
  client_id: string | null;
  technician_name: string | null;
  assigned_user_id: string | null;
  platform: string | null;
  total: number | null;
  services: any;
  created_at: string;
  status: string;
}

export interface MatchCandidate {
  so: SORecord;
  po: PORecord;
  score: number;
  reasons: string[];
  soServices: { name: string; price: number }[];
  poServices: { name: string; price: number }[];
}

export interface PendingItem {
  id: string; // reconciliation id
  so: SORecord;
  po: PORecord;
  soServices: { name: string; price: number }[];
  poServices: { name: string; price: number }[];
  totalSO: number;
  totalPO: number;
  difference: number;
  created_at: string;
  aging_level: "normal" | "warning" | "critical";
}

export interface HistoryItem {
  id: string;
  so_plate: string;
  po_plate: string;
  so_client: string;
  po_client: string;
  totalSO: number;
  totalPO: number;
  difference: number;
  resolved_at: string;
  action: string; // "validated" | "cleared"
  created_at: string;
}

/** Get potential matches for Fusão Manual - only SO+OP pairs with score >= 40 */
export function useMatchCandidates() {
  return useQuery({
    queryKey: ["match-candidates"],
    retry: 0,
    queryFn: () => getConfrontoCandidates() as Promise<MatchCandidate[]>,
  });
}

/** Merge (Fundir) a match - creates reconciliation record */
export function useMergeMatch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ soId, poId }: { soId: string; poId: string }) => confrontoMerge(soId, poId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["match-candidates"] });
      qc.invalidateQueries({ queryKey: ["confronto-pending"] });
      qc.invalidateQueries({ queryKey: ["confronto-history"] });
      qc.invalidateQueries({ queryKey: ["reconciliation-summary"] });
      if (result.isExact) {
        toast.success("Valores iguais — enviado para Histórico");
      } else {
        toast.info(`Diferença de €${Math.abs(result.diff).toFixed(2)} — enviado para Pendentes`);
      }
    },
    onError: (err) => toast.error("Erro ao fundir: " + (err as Error).message),
  });
}

/** Reject match - permanently mark as not-a-match */
export function useRejectMatch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ soId, poId }: { soId: string; poId: string }) => confrontoReject(soId, poId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["match-candidates"] });
      toast.success("Correspondência rejeitada");
    },
    onError: (err) => toast.error("Erro: " + (err as Error).message),
  });
}

/** Get pending items (matched with value discrepancies) */
export function useConfrontoPending() {
  return useQuery({
    queryKey: ["confronto-pending"],
    retry: 0,
    queryFn: () => getConfrontoPending() as Promise<PendingItem[]>,
  });
}

/** Validate all - mark as resolved and record financial adjustment */
export function useValidatePending() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, difference }: { id: string; difference: number }) => confrontoValidate(id, difference),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["confronto-pending"] });
      qc.invalidateQueries({ queryKey: ["confronto-history"] });
      qc.invalidateQueries({ queryKey: ["reconciliation-summary"] });
      toast.success("Divergência validada e movida para Histórico");
    },
    onError: (err) => toast.error("Erro: " + (err as Error).message),
  });
}

/** Get history items */
export function useConfrontoHistory() {
  return useQuery({
    queryKey: ["confronto-history"],
    retry: 0,
    queryFn: () => getConfrontoHistory() as Promise<HistoryItem[]>,
  });
}
