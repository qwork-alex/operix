import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("reconciliations")
        .select("*, service_orders(id, license_plate, car_name, total, platform, week, client_name, technician_name, created_at), payment_orders(id, license_plate, car_name, total, platform, client_name, technician_name, created_at)")
        .order("created_at", { ascending: false });
      if (error) throw error;

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
      // Clean orphaned financial_records before reconciling
      const [soIds, poIds] = await Promise.all([
        supabase.from("service_orders").select("id"),
        supabase.from("payment_orders").select("id"),
      ]);
      const validSOIds = new Set((soIds.data ?? []).map((r: any) => r.id));
      const validPOIds = new Set((poIds.data ?? []).map((r: any) => r.id));

      const { data: frData } = await supabase.from("financial_records")
        .select("id, source, service_order_id, payment_order_id")
        .in("source", ["service_orders", "payment_orders"]);

      const orphanIds = (frData ?? [])
        .filter((r: any) => {
          if (r.source === "service_orders" && r.service_order_id && !validSOIds.has(r.service_order_id)) return true;
          if (r.source === "payment_orders" && r.payment_order_id && !validPOIds.has(r.payment_order_id)) return true;
          return false;
        })
        .map((r: any) => r.id);

      if (orphanIds.length > 0) {
        for (const oid of orphanIds) {
          await supabase.from("financial_records").delete().eq("id", oid);
        }
        console.log(`Cleaned ${orphanIds.length} orphaned financial records`);
      }

      // Hard reset: clear previous auto reconciliation results before running
      await (supabase as any).from("reconciliations").delete().eq("matched_by", "auto");
      console.log("Pre-run: cleared all auto reconciliation results");

      const { data, error } = await supabase.functions.invoke("run-reconciliation");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      console.log("Reconciliation result:", JSON.stringify({
        so_count: data.debug?.so_count,
        po_count: data.debug?.po_count,
        matched: data.matched,
        mismatched: data.mismatched,
        missing: data.missing,
        status: data.status,
      }));

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
    mutationFn: async ({ serviceOrderId, paymentOrderId }: { serviceOrderId: string; paymentOrderId: string }) => {
      const [soRes, poRes] = await Promise.all([
        supabase.from("service_orders").select("total, license_plate, client_name").eq("id", serviceOrderId).single(),
        supabase.from("payment_orders").select("total, license_plate, client_name").eq("id", paymentOrderId).single(),
      ]);

      const soTotal = Number(soRes.data?.total || 0);
      const poTotal = Number(poRes.data?.total || 0);
      const diff = soTotal - poTotal;
      const status = Math.abs(diff) < 0.01 ? "matched" : "mismatch";

      const notes = JSON.stringify({
        match_reasons: ["manual"],
        match_type: status === "matched" ? "exact_match" : "partial_match",
        explanation: `Fusão manual: OS (${soRes.data?.license_plate || 'N/A'}, ${soRes.data?.client_name || 'N/A'}) ↔ OP (${poRes.data?.license_plate || 'N/A'}, ${poRes.data?.client_name || 'N/A'}). ${status === "matched" ? "Valores iguais." : `Diferença: €${Math.abs(diff).toFixed(2)}`}`,
        so_total: soTotal,
        po_total: poTotal,
      });

      // Delete any existing auto reconciliation for these IDs
      await (supabase as any).from("reconciliations").delete().eq("service_order_id", serviceOrderId).eq("matched_by", "auto");
      await (supabase as any).from("reconciliations").delete().eq("payment_order_id", paymentOrderId).eq("matched_by", "auto");

      const { data, error } = await (supabase as any).from("reconciliations").insert({
        service_order_id: serviceOrderId,
        payment_order_id: paymentOrderId,
        matched_by: "manual",
        confidence_score: 100,
        difference_amount: diff,
        status,
        notes,
      }).select().single();

      if (error) throw error;
      return data;
    },
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
    mutationFn: async ({ id, adjustedValue }: { id: string; adjustedValue: number }) => {
      // Read current notes, merge adjusted_value
      const { data: current } = await (supabase as any)
        .from("reconciliations")
        .select("notes, difference_amount")
        .eq("id", id)
        .single();

      const existingNotes = current?.notes ? JSON.parse(current.notes) : {};
      const updatedNotes = JSON.stringify({
        ...existingNotes,
        adjusted_value: adjustedValue,
        correction_date: new Date().toISOString(),
      });

      const { error } = await (supabase as any)
        .from("reconciliations")
        .update({ notes: updatedNotes, status: "matched" })
        .eq("id", id);

      if (error) throw error;
    },
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
    mutationFn: async ({ id }: { id: string }) => {
      const { data: current } = await (supabase as any)
        .from("reconciliations")
        .select("notes")
        .eq("id", id)
        .single();

      const existingNotes = current?.notes ? JSON.parse(current.notes) : {};
      const updatedNotes = JSON.stringify({
        ...existingNotes,
        validated: true,
        validated_at: new Date().toISOString(),
      });

      const { error } = await (supabase as any)
        .from("reconciliations")
        .update({ notes: updatedNotes, status: "matched", matched_by: "validated" })
        .eq("id", id);

      if (error) throw error;
    },
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
    mutationFn: async ({ id }: { id: string }) => {
      const { data: current } = await (supabase as any)
        .from("reconciliations")
        .select("notes")
        .eq("id", id)
        .single();

      const existingNotes = current?.notes ? JSON.parse(current.notes) : {};
      const updatedNotes = JSON.stringify({
        ...existingNotes,
        cleared: true,
        cleared_at: new Date().toISOString(),
      });

      const { error } = await (supabase as any)
        .from("reconciliations")
        .update({ notes: updatedNotes })
        .eq("id", id);

      if (error) throw error;
    },
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
    queryFn: async () => {
      const [soRes, poRes, recRes, frRes] = await Promise.all([
        supabase.from("service_orders").select("total, status, client_id, client_name, assigned_user_id, technician_name, platform, created_at"),
        supabase.from("payment_orders").select("total, status, client_id, client_name, assigned_user_id, technician_name, platform, created_at"),
        (supabase as any).from("reconciliations").select("status, difference_amount, confidence_score, matched_by, notes"),
        supabase.from("financial_records").select("amount, type, category, created_at, source, service_order_id, payment_order_id"),
      ]);

      const serviceOrders = soRes.data ?? [];
      const paymentOrders = poRes.data ?? [];
      const reconciliations = recRes.data ?? [];
      const financialRecords = frRes.data ?? [];

      const realExpenses = financialRecords.filter((r: any) => r.type === "expense");
      const expenses = realExpenses.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

      const expectedRevenue = serviceOrders.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
      const receivedRevenue = paymentOrders.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
      const totalDifference = expectedRevenue - receivedRevenue;
      const discrepancyPct = expectedRevenue > 0 ? (Math.abs(totalDifference) / expectedRevenue) * 100 : 0;

      const matched = reconciliations.filter((r: any) => r.status === "matched").length;
      const mismatched = reconciliations.filter((r: any) => r.status === "mismatch").length;
      const missing = reconciliations.filter((r: any) => r.status === "missing").length;
      const pending = reconciliations.filter((r: any) => r.status === "pending").length;

      // Count discrepancies needing attention (not cleared)
      const activeDiscrepancies = reconciliations.filter((r: any) => {
        const notes = r.notes ? (() => { try { return JSON.parse(r.notes); } catch { return {}; } })() : {};
        return !notes.cleared && (r.status === "mismatch" || r.status === "missing");
      }).length;

      const profit = receivedRevenue - expenses;

      // Monthly data
      const monthlyData: Record<string, { so: number; po: number; expenses: number }> = {};
      for (const so of serviceOrders) {
        const month = so.created_at?.slice(0, 7) || "unknown";
        if (!monthlyData[month]) monthlyData[month] = { so: 0, po: 0, expenses: 0 };
        monthlyData[month].so += Number(so.total || 0);
      }
      for (const po of paymentOrders) {
        const month = po.created_at?.slice(0, 7) || "unknown";
        if (!monthlyData[month]) monthlyData[month] = { so: 0, po: 0, expenses: 0 };
        monthlyData[month].po += Number(po.total || 0);
      }
      for (const fr of realExpenses) {
        const month = fr.created_at?.slice(0, 7) || "unknown";
        if (!monthlyData[month]) monthlyData[month] = { so: 0, po: 0, expenses: 0 };
        monthlyData[month].expenses += Number(fr.amount || 0);
      }

      const monthly = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, d]) => ({ month, expected: d.so, received: d.po, expenses: d.expenses }));

      const byClient: Record<string, { name: string; expected: number; received: number }> = {};
      for (const so of serviceOrders) {
        const name = so.client_name || "Desconhecido";
        if (!byClient[name]) byClient[name] = { name, expected: 0, received: 0 };
        byClient[name].expected += Number(so.total || 0);
      }
      for (const po of paymentOrders) {
        const name = po.client_name || "Desconhecido";
        if (!byClient[name]) byClient[name] = { name, expected: 0, received: 0 };
        byClient[name].received += Number(po.total || 0);
      }

      const byTechnician: Record<string, { name: string; expected: number; received: number }> = {};
      for (const so of serviceOrders) {
        const name = so.technician_name || "Desconhecido";
        if (!byTechnician[name]) byTechnician[name] = { name, expected: 0, received: 0 };
        byTechnician[name].expected += Number(so.total || 0);
      }
      for (const po of paymentOrders) {
        const name = po.technician_name || "Desconhecido";
        if (!byTechnician[name]) byTechnician[name] = { name, expected: 0, received: 0 };
        byTechnician[name].received += Number(po.total || 0);
      }

      const byPlatform: Record<string, { expected: number; received: number }> = {};
      for (const so of serviceOrders) {
        const p = so.platform || "Desconhecido";
        if (!byPlatform[p]) byPlatform[p] = { expected: 0, received: 0 };
        byPlatform[p].expected += Number(so.total || 0);
      }
      for (const po of paymentOrders) {
        const p = po.platform || "Desconhecido";
        if (!byPlatform[p]) byPlatform[p] = { expected: 0, received: 0 };
        byPlatform[p].received += Number(po.total || 0);
      }

      const alerts: { type: string; message: string; severity: "high" | "medium" | "low" }[] = [];

      if (serviceOrders.length === 0 && paymentOrders.length === 0) {
        alerts.push({ type: "empty", message: "Nenhuma ordem de serviço ou pagamento encontrada. Importe dados primeiro.", severity: "medium" });
      } else {
        if (missing > 0) alerts.push({ type: "missing", message: `${missing} registros sem correspondência`, severity: "high" });
        if (mismatched > 0) alerts.push({ type: "mismatch", message: `${mismatched} divergências de valor detectadas`, severity: "medium" });
        if (discrepancyPct > 10) alerts.push({ type: "high_discrepancy", message: `Taxa de discrepância: ${discrepancyPct.toFixed(1)}%`, severity: "high" });
      }

      return {
        expectedRevenue,
        receivedRevenue,
        totalDifference,
        discrepancyPct: Math.round(discrepancyPct * 10) / 10,
        matched,
        mismatched,
        missing,
        pending,
        expenses,
        profit,
        monthly,
        activeDiscrepancies,
        byClient: Object.values(byClient).sort((a, b) => b.expected - a.expected),
        byTechnician: Object.values(byTechnician).sort((a, b) => b.expected - a.expected),
        byPlatform: Object.entries(byPlatform).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.expected - a.expected),
        alerts,
        serviceOrderCount: serviceOrders.length,
        paymentOrderCount: paymentOrders.length,
      };
    },
  });
}
