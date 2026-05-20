import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId, logSaveError, logSavePayload } from "@/lib/authUser";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { invalidateAccountingDownstream } from "@/lib/financialSync";
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
    queryFn: async () => {
      if (isFuelMirror) {
        let q = supabase
          .from("fleet_fuel_logs")
          .select("id, total_cost, liters, km_at_fuel, date, notes, vehicle_id, created_at, driver_id, vehicles(brand, model, license_plate)");
        if (workspaceId) q = q.eq("workspace_id", workspaceId);
        if (selectedYear && !selectedMonth) {
          q = q.gte("date", `${selectedYear}-01-01`).lte("date", `${selectedYear}-12-31`);
        }
        if (selectedYear && selectedMonth) {
          const mm = String(selectedMonth).padStart(2, "0");
          const last = new Date(selectedYear, selectedMonth, 0).getDate();
          q = q.gte("date", `${selectedYear}-${mm}-01`).lte("date", `${selectedYear}-${mm}-${last}`);
        }
        const { data, error } = await q.order("date", { ascending: false });
        if (error) throw error;
        return (data || []).map((r: any) => {
          const v = r.vehicles || {};
          const vehicleLabel = `${v.brand || ""} ${v.model || ""} ${v.license_plate || ""}`.trim();
          const noteParts = [
            `${Number(r.liters || 0)}L`,
            r.km_at_fuel ? `${Number(r.km_at_fuel).toLocaleString()} km` : null,
            r.notes,
          ].filter(Boolean);
          return {
            id: r.id,
            label: vehicleLabel ? `Combustível — ${vehicleLabel}` : "Combustível",
            amount: Number(r.total_cost || 0),
            notes: noteParts.join(" • "),
            created_at: r.date || r.created_at,
          };
        });
      }

      let q = supabase
        .from("financial_records")
        .select("*")
        .eq("type", "expense")
        .eq("workspace_id", workspaceId!);

      if (config.category) {
        q = q.eq("category", config.category);
      } else if (moduleKey === "expenses") {
        q = q.eq("category", "other");
      }

      if (selectedYear) q = q.eq("year_reference", selectedYear);
      if (selectedTech) q = q.eq("assigned_user_id", selectedTech);
      if (monthRange) q = q.gte("created_at", monthRange.startISO).lte("created_at", monthRange.endISO);

      q = q.order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
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
      const { error } = await (supabase as any).from("financial_records").insert(payload);
      if (error) {
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
      const { error } = await (supabase as any)
        .from("financial_records")
        .update(payload)
        .eq("id", id);
      if (error) {
        logSaveError("AccountingModule:update", error);
        throw error;
      }
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isFuelMirror) throw new Error("Combustível é gerido na Frota");
      const { error } = await supabase.from("financial_records").delete().eq("id", id);
      if (error) throw error;
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
