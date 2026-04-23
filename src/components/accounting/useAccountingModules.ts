import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveTechnicianIdForFinancialRecord } from "@/lib/getTechnicianForRecord";
import type { ModuleEntry } from "./ModulePanel";

type ModuleKey = "rentals" | "expenses" | "fuel" | "purchases" | "government" | "withdrawals";

const CATEGORY_MAP: Record<ModuleKey, { type: string; category?: string; source?: string }> = {
  rentals: { type: "expense", category: "rent" },
  expenses: { type: "expense" },
  fuel: { type: "expense", category: "fuel" },
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

export function useAccountingModule(moduleKey: ModuleKey) {
  const queryClient = useQueryClient();
  const config = CATEGORY_MAP[moduleKey];

  // FUEL is a read-only mirror of fleet_fuel_logs (Frota = single source of truth)
  const isFuelMirror = moduleKey === "fuel";

  const query = useQuery({
    queryKey: isFuelMirror
      ? ["accounting-module", "fuel", "fleet-mirror"]
      : ["accounting-module", moduleKey],
    queryFn: async () => {
      if (isFuelMirror) {
        const { data, error } = await supabase
          .from("fleet_fuel_logs")
          .select("id, total_cost, liters, km_at_fuel, date, notes, vehicle_id, created_at, vehicles(brand, model, license_plate)")
          .order("date", { ascending: false });
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

      let q = supabase.from("financial_records").select("*").eq("type", "expense");

      if (config.category) {
        // Strict category match — each module owns its own bucket
        q = q.eq("category", config.category);
      } else if (moduleKey === "expenses") {
        // "Despesas" module owns ONLY entries explicitly categorized as "other"
        q = q.eq("category", "other");
      }

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

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: isFuelMirror ? ["accounting-module", "fuel", "fleet-mirror"] : ["accounting-module", moduleKey],
    });

  const addMutation = useMutation({
    mutationFn: async (entry: { label: string; amount: number; notes: string }) => {
      if (isFuelMirror) throw new Error("Combustível é gerido na Frota");
      const { data: { user } } = await supabase.auth.getUser();
      const technicianId = await resolveTechnicianIdForFinancialRecord();
      const { error } = await supabase.from("financial_records").insert({
        type: config.type || "expense",
        source: "manual",
        category: config.category || "other",
        amount: entry.amount,
        label: entry.label,
        notes: entry.notes,
        status: "confirmed",
        created_by: user?.id,
        technician_id: technicianId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...entry }: { id: string; label: string; amount: number; notes: string }) => {
      if (isFuelMirror) throw new Error("Combustível é gerido na Frota");
      const { error } = await supabase
        .from("financial_records")
        .update({ label: entry.label, amount: entry.amount, notes: entry.notes })
        .eq("id", id);
      if (error) throw error;
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
    allowAdd: isManualEditable,
  };
}
