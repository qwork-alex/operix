import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCurrentUserId, logSaveError, logSavePayload } from "@/lib/authUser";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { invalidateAccountingDownstream } from "@/lib/financialSync";
import {
  listFinancialRecords,
  createFinancialRecord,
  updateFinancialRecord,
  deleteFinancialRecord,
} from "@/lib/apiFinance";
import type { ModuleEntry } from "./ModulePanel";

type ModuleKey = "rentals" | "expenses" | "fuel" | "travel" | "purchases" | "government" | "withdrawals";

const CATEGORY_MAP: Record<ModuleKey, { type: string; category?: string; source?: string }> = {
  rentals: { type: "expense", category: "rent" },
  expenses: { type: "expense" },
  fuel: { type: "expense", category: "fuel" },
  travel: { type: "expense", category: "travel" },
  purchases: { type: "expense", category: "material" },
  government: { type: "expense", category: "tax" },
  withdrawals: { type: "expense", category: "salary" },
};

function buildEntries(data: any[], editable: boolean): ModuleEntry[] {
  return (data || []).map((r: any) => ({
    id: r.id,
    label: r.label || r.notes || r.source || "—",
    amount: Number(r.amount || 0),
    notes: r.notes || "",
    created_at: r.created_at,
    editable,
  }));
}

export function useAccountingModule(
  moduleKey: ModuleKey,
  year?: number,
  techId?: string | null,
  month?: number | null, // 1-12
) {
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const { user } = useAuth();
  const config = CATEGORY_MAP[moduleKey];

  const isFuelMirror = moduleKey === "fuel";
  const selectedYear = year ?? null;
  const selectedMonth = month && month >= 1 && month <= 12 ? month : null;
  const selectedTech = techId || null;

  const monthRange = (() => {
    if (!selectedYear || !selectedMonth) return null;
    const start = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1));
    const end = new Date(Date.UTC(selectedYear, selectedMonth, 0, 23, 59, 59));
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  })();

  const query = useQuery({
    queryKey: isFuelMirror
      ? ["accounting-module", "fuel", "fleet-mirror", workspaceId, selectedYear, selectedMonth, selectedTech]
      : ["accounting-module", moduleKey, workspaceId, user?.id, selectedYear, selectedMonth, selectedTech],
    enabled: !!workspaceId,
    retry: 0,
    queryFn: async () => {
      if (isFuelMirror) {
        // Espelho da Frota: módulo Fleet ainda não migrado do Supabase
        // (fora da onda 2). Sem dados até a migração da frota.
        return [] as any[];
      }

      return listFinancialRecords({
        workspace_id: workspaceId!,
        type: "expense",
        category: config.category ?? (moduleKey === "expenses" ? "other" : undefined),
        year_reference: selectedYear ?? undefined,
        assigned_user_id: selectedTech ?? undefined,
        created_from: monthRange?.startISO,
        created_to: monthRange?.endISO,
      });
    },
  });

  const isManualEditable = !isFuelMirror;

  const entries: ModuleEntry[] = isFuelMirror
    ? (query.data as any[] || []).map((r) => ({ ...r, editable: false }))
    : buildEntries(query.data || [], isManualEditable);
  const total = entries.reduce((s, e) => s + e.amount, 0);

  const invalidate = () => {
    invalidateAccountingDownstream(queryClient);
  };

  const addMutation = useMutation({
    mutationFn: async (entry: { label: string; amount: number; notes: string }) => {
      if (isFuelMirror) throw new Error("Combustível é gerido na Frota");
      if (!workspaceId) throw new Error("Workspace ativa não encontrada");
      const currentUserId = await getCurrentUserId();
      const yr = selectedYear ?? new Date().getFullYear();
      // Phase 5C: scope new accounting entries to the active (year, month, tech)
      // so the temporal source of truth from Detalhamento is respected.
      const createdAt = selectedMonth
        ? new Date(Date.UTC(yr, selectedMonth - 1, 15)).toISOString()
        : undefined;
      const payload: Record<string, unknown> = {
        type: config.type || "expense",
        source: "manual",
        origin: "manual",
        category: config.category || "other",
        amount: entry.amount,
        label: entry.label,
        notes: entry.notes,
        status: "confirmed",
        workspace_id: workspaceId,
        year_reference: yr,
      };
      if (selectedTech) payload.assigned_user_id = selectedTech;
      if (createdAt) payload.created_at = createdAt;
      logSavePayload("AccountingModule:insert", currentUserId, payload);
      try {
        await createFinancialRecord(payload);
      } catch (error) {
        logSaveError("AccountingModule:insert", error);
        throw error;
      }
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...entry }: { id: string; label: string; amount: number; notes: string }) => {
      if (isFuelMirror) throw new Error("Combustível é gerido na Frota");
      const currentUserId = await getCurrentUserId();
      const payload = { label: entry.label, amount: entry.amount, notes: entry.notes };
      logSavePayload("AccountingModule:update", currentUserId, payload);
      try {
        await updateFinancialRecord(id, payload);
      } catch (error) {
        logSaveError("AccountingModule:update", error);
        throw error;
      }
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isFuelMirror) throw new Error("Combustível é gerido na Frota");
      await deleteFinancialRecord(id);
    },
    onSuccess: invalidate,
  });

  return {
    entries,
    total,
    isLoading: query.isLoading,
    add: addMutation.mutateAsync,
    update: (id: string, e: { label: string; amount: number; notes: string }) =>
      updateMutation.mutateAsync({ id, ...e }),
    delete: deleteMutation.mutateAsync,
    allowAdd: isManualEditable && !!workspaceId,
  };
}
