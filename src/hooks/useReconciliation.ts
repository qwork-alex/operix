import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useReconciliations() {
  return useQuery({
    queryKey: ["reconciliations"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("reconciliations")
        .select("*, service_orders(id, license_plate, car_name, total, platform, week, client_id, technician_id, clients(name), technicians(name)), payment_orders(id, license_plate, car_name, total, platform, client_id, technician_id, clients(name), technicians(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useRunReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("run-reconciliation");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation-summary"] });
      toast.success(`Reconciliation: ${data.matched} matched, ${data.mismatched} mismatches, ${data.missing} missing`);
    },
    onError: (err) => {
      toast.error("Reconciliation failed: " + (err as Error).message);
    },
  });
}

export function useManualMerge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ serviceOrderId, paymentOrderId }: { serviceOrderId: string; paymentOrderId: string }) => {
      // Fetch both orders to calculate difference
      const [soRes, poRes] = await Promise.all([
        supabase.from("service_orders").select("total").eq("id", serviceOrderId).single(),
        supabase.from("payment_orders").select("total").eq("id", paymentOrderId).single(),
      ]);

      const soTotal = Number(soRes.data?.total || 0);
      const poTotal = Number(poRes.data?.total || 0);
      const diff = soTotal - poTotal;
      const status = Math.abs(diff) < 0.01 ? "matched" : "mismatch";

      const { data, error } = await (supabase as any).from("reconciliations").upsert({
        service_order_id: serviceOrderId,
        payment_order_id: paymentOrderId,
        matched_by: "manual",
        confidence_score: 100,
        difference_amount: diff,
        status,
        updated_at: new Date().toISOString(),
      }, { onConflict: "service_order_id,payment_order_id" }).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation-summary"] });
      toast.success("Records merged successfully");
    },
    onError: (err) => toast.error("Merge failed: " + (err as Error).message),
  });
}

export function useReconciliationSummary() {
  return useQuery({
    queryKey: ["reconciliation-summary"],
    queryFn: async () => {
      const [soRes, poRes, recRes, frRes] = await Promise.all([
        supabase.from("service_orders").select("total, status, client_id, technician_id, platform, created_at, clients(name), technicians(name)") as any,
        supabase.from("payment_orders").select("total, status, client_id, technician_id, platform, created_at, clients(name), technicians(name)"),
        (supabase as any).from("reconciliations").select("status, difference_amount, confidence_score, matched_by"),
        supabase.from("financial_records").select("amount, type, category, created_at"),
      ]);

      const serviceOrders = soRes.data ?? [];
      const paymentOrders = poRes.data ?? [];
      const reconciliations = recRes.data ?? [];
      const financialRecords = frRes.data ?? [];

      const expectedRevenue = serviceOrders.reduce((s, o) => s + Number(o.total || 0), 0);
      const receivedRevenue = paymentOrders.reduce((s, o) => s + Number(o.total || 0), 0);
      const totalDifference = expectedRevenue - receivedRevenue;
      const discrepancyPct = expectedRevenue > 0 ? (Math.abs(totalDifference) / expectedRevenue) * 100 : 0;

      const matched = reconciliations.filter(r => r.status === "matched").length;
      const mismatched = reconciliations.filter(r => r.status === "mismatch").length;
      const missing = reconciliations.filter(r => r.status === "missing").length;
      const pending = reconciliations.filter(r => r.status === "pending").length;

      // Expenses from financial_records
      const expenses = financialRecords
        .filter(r => r.type === "expense")
        .reduce((s, r) => s + Number(r.amount || 0), 0);
      const profit = receivedRevenue - expenses;

      // Monthly data for charts
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
      for (const fr of financialRecords) {
        if (fr.type === "expense") {
          const month = fr.created_at?.slice(0, 7) || "unknown";
          if (!monthlyData[month]) monthlyData[month] = { so: 0, po: 0, expenses: 0 };
          monthlyData[month].expenses += Number(fr.amount || 0);
        }
      }

      const monthly = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, d]) => ({ month, expected: d.so, received: d.po, expenses: d.expenses }));

      // Breakdown by client
      const byClient: Record<string, { name: string; expected: number; received: number }> = {};
      for (const so of serviceOrders) {
        const name = (so as any).clients?.name || "Unknown";
        const cid = so.client_id || "none";
        if (!byClient[cid]) byClient[cid] = { name, expected: 0, received: 0 };
        byClient[cid].expected += Number(so.total || 0);
      }
      for (const po of paymentOrders) {
        const name = (po as any).clients?.name || "Unknown";
        const cid = po.client_id || "none";
        if (!byClient[cid]) byClient[cid] = { name, expected: 0, received: 0 };
        byClient[cid].received += Number(po.total || 0);
      }

      // Breakdown by technician
      const byTechnician: Record<string, { name: string; expected: number; received: number }> = {};
      for (const so of serviceOrders) {
        const name = (so as any).technicians?.name || "Unknown";
        const tid = so.technician_id || "none";
        if (!byTechnician[tid]) byTechnician[tid] = { name, expected: 0, received: 0 };
        byTechnician[tid].expected += Number(so.total || 0);
      }
      for (const po of paymentOrders) {
        const name = (po as any).technicians?.name || "Unknown";
        const tid = po.technician_id || "none";
        if (!byTechnician[tid]) byTechnician[tid] = { name, expected: 0, received: 0 };
        byTechnician[tid].received += Number(po.total || 0);
      }

      // Breakdown by platform
      const byPlatform: Record<string, { expected: number; received: number }> = {};
      for (const so of serviceOrders) {
        const p = so.platform || "Unknown";
        if (!byPlatform[p]) byPlatform[p] = { expected: 0, received: 0 };
        byPlatform[p].expected += Number(so.total || 0);
      }
      for (const po of paymentOrders) {
        const p = po.platform || "Unknown";
        if (!byPlatform[p]) byPlatform[p] = { expected: 0, received: 0 };
        byPlatform[p].received += Number(po.total || 0);
      }

      // Alerts
      const alerts: { type: string; message: string; severity: "high" | "medium" | "low" }[] = [];
      if (missing > 0) alerts.push({ type: "missing", message: `${missing} unmatched records`, severity: "high" });
      if (mismatched > 0) alerts.push({ type: "mismatch", message: `${mismatched} value mismatches`, severity: "medium" });
      if (discrepancyPct > 10) alerts.push({ type: "high_discrepancy", message: `Discrepancy rate: ${discrepancyPct.toFixed(1)}%`, severity: "high" });

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
