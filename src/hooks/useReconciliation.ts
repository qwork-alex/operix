import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listReconciliations,
  runReconciliation,
  manualMergeReconciliation,
  patchReconciliation,
  getFinanceSummary,
} from "@/lib/apiFinance";

export interface ReconciliationDetail {
  id: string;
  status: string;
  matched_by: string;
  confidence_score: number;
  difference_amount: number;
  notes: string | null;
  created_at: string;
  service_orders: any | null;
  payment_orders: any | null;
  parsed_notes?: {
    match_reasons?: string[];
    explanation?: string;
    so_plate?: string;
    po_plate?: string;
    so_client?: string;
    po_client?: string;
    so_total?: number;
    po_total?: number;
    so_date?: string;
    po_date?: string;
    days_diff?: number;
    value_similarity?: number;
    type?: string;
    match_type?: string;
    adjusted_value?: number;
    correction_date?: string;
    validated?: boolean;
    validated_at?: string;
    cleared?: boolean;
    cleared_at?: string;
  };
  // Computed fields
  adjusted_value?: number | null;
  cleared?: boolean;
  aging_level?: "normal" | "warning" | "critical";
}

function parseNotes(notes: string | null): ReconciliationDetail["parsed_notes"] {
  if (!notes) return undefined;
  try {
    return JSON.parse(notes);
  } catch {
    return { explanation: notes };
  }
}

function getAgingLevel(createdAt: string): "normal" | "warning" | "critical" {
  const days = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days >= 7) return "critical";
  if (days >= 3) return "warning";
  return "normal";
}

/** Deduplicate: if manual exists for same SO or PO, hide auto */
function deduplicateReconciliations(rows: ReconciliationDetail[]): ReconciliationDetail[] {
  const manualSOIds = new Set<string>();
  const manualPOIds = new Set<string>();

  for (const r of rows) {
    if (r.matched_by === "manual") {
      if (r.service_orders?.id) manualSOIds.add(r.service_orders.id);
      if (r.payment_orders?.id) manualPOIds.add(r.payment_orders.id);
    }
  }

  return rows.filter((r) => {
    if (r.matched_by !== "auto") return true;
    if (r.service_orders?.id && manualSOIds.has(r.service_orders.id)) return false;
    if (r.payment_orders?.id && manualPOIds.has(r.payment_orders.id)) return false;
    return true;
  });
}

/** Remove ghost/orphan rows where both SO and PO are null */
function removeGhostData(rows: ReconciliationDetail[]): ReconciliationDetail[] {
  return rows.filter((r) => r.service_orders || r.payment_orders);
}

export function useReconciliations() {
  return useQuery({
    queryKey: ["reconciliations"],
    retry: 0,
    placeholderData: (previousData) => previousData ?? [],
    queryFn: async () => {
      const data = await listReconciliations();

      const parsed = (data as any[]).map((r) => ({
        ...r,
        parsed_notes: parseNotes(r.notes),
        aging_level: getAgingLevel(r.created_at),
        cleared: false,
        adjusted_value: null,
      })) as ReconciliationDetail[];

      // Clean ghost data then deduplicate manual > auto
      return deduplicateReconciliations(removeGhostData(parsed));
    },
  });
}

/** Split reconciliations into 3 views */
export function useSplitReconciliations() {
  const { data: all = [], ...rest } = useReconciliations();

  const matched = all.filter(
    (r) =>
      r.status === "matched" ||
      (r.status === "mismatch" && r.parsed_notes?.match_type === "partial_match")
  );

  const pending = all.filter((r) => r.status === "missing" || r.status === "pending");

  return { matched, pending, all, ...rest };
}

export function useRunReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Limpeza de órfãos + hard reset dos autos acontecem no backend
      const data = await runReconciliation();
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation-summary"] });

      if (data.status === "no_data") {
        toast.info(data.message || "Sem dados para reconciliar");
      } else {
        toast.success(`Reconciliação: ${data.matched} corretos, ${data.mismatched} divergentes, ${data.missing} ausentes`);
      }
    },
    onError: (err) => {
      toast.error("Reconciliação falhou: " + (err as Error).message);
    },
  });
}

export function useManualMerge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serviceOrderId, paymentOrderId }: { serviceOrderId: string; paymentOrderId: string }) =>
      manualMergeReconciliation(serviceOrderId, paymentOrderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation-summary"] });
      toast.success("Registros vinculados com sucesso");
    },
    onError: (err) => toast.error("Falha na vinculação: " + (err as Error).message),
  });
}

/** Correct a reconciliation value without overwriting originals */
export function useCorrectReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, adjustedValue }: { id: string; adjustedValue: number }) =>
      patchReconciliation(id, {
        status: "matched",
        merge_notes: { adjusted_value: adjustedValue, correction_date: new Date().toISOString() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
      toast.success("Valor corrigido com sucesso");
    },
    onError: (err) => toast.error("Erro ao corrigir: " + (err as Error).message),
  });
}

/** Validate (confirm) a reconciliation */
export function useValidateReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      patchReconciliation(id, {
        status: "matched",
        matched_by: "validated",
        merge_notes: { validated: true, validated_at: new Date().toISOString() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
      toast.success("Reconciliação validada");
    },
    onError: (err) => toast.error("Erro: " + (err as Error).message),
  });
}

/** Clear from view — marks as resolved/cleared in notes but keeps data */
export function useClearReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      patchReconciliation(id, {
        merge_notes: { cleared: true, cleared_at: new Date().toISOString() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
      toast.success("Removido da vista ativa");
    },
    onError: (err) => toast.error("Erro: " + (err as Error).message),
  });
}

export function useReconciliationSummary() {
  return useQuery({
    queryKey: ["reconciliation-summary"],
    retry: 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: (previousData) => previousData,
    queryFn: () => getFinanceSummary(),
  });
}
