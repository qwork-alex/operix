import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ModuleEntry } from "./ModulePanel";

type ModuleKey = "revenue" | "expenses" | "fuel" | "purchases" | "government" | "withdrawals";

const CATEGORY_MAP: Record<ModuleKey, { type: string; category?: string; source?: string }> = {
  revenue: { type: "revenue", source: "payment_orders" },
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

  const query = useQuery({
    queryKey: ["accounting-module", moduleKey],
    queryFn: async () => {
      let q = supabase.from("financial_records").select("*");

      if (moduleKey === "revenue") {
        q = q.eq("type", "revenue");
      } else if (config.category) {
        q = q.eq("type", "expense").eq("category", config.category);
      } else if (moduleKey === "expenses") {
        // All expenses not in specific categories
        q = q.eq("type", "expense");
      }

      q = q.order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const isManualEditable = moduleKey !== "revenue";

  const entries: ModuleEntry[] = buildEntries(query.data || [], isManualEditable);
  const total = entries.reduce((s, e) => s + e.amount, 0);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["accounting-module", moduleKey] });

  const addMutation = useMutation({
    mutationFn: async (entry: { label: string; amount: number; notes: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("financial_records").insert({
        type: config.type || "expense",
        source: "manual",
        category: config.category || "other",
        amount: entry.amount,
        label: entry.label,
        notes: entry.notes,
        status: "confirmed",
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...entry }: { id: string; label: string; amount: number; notes: string }) => {
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
