/**
 * useOperationalCopilot — fetches the operational dataset for the current
 * workspace, runs the deterministic Copilot analyzers, and returns the
 * snapshot. Cached per workspace via TanStack Query.
 *
 * No UI is rendered. Surfaces opt in by calling this hook.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { OperationalCopilot } from "@/lib/copilot";
import type {
  CopilotAutomationRun,
  CopilotDataset,
  CopilotFinancialRecord,
  CopilotFuelLog,
  CopilotPaymentOrder,
  CopilotProductionOrder,
  CopilotServiceOrder,
  CopilotSnapshot,
  CopilotTechnician,
} from "@/lib/copilot";

const WINDOW_DAYS = 60;

function ts(v: string | null | undefined): number {
  if (!v) return 0;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

async function loadDataset(workspaceId: string): Promise<CopilotDataset> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();

  // Each query is best-effort: if a table doesn't exist or RLS blocks, we
  // surface an empty slice rather than crashing the whole analysis.
  const safe = async <T,>(p: Promise<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
    try {
      const { data, error } = await p;
      if (error) return [];
      return data ?? [];
    } catch {
      return [];
    }
  };

  const [
    soRows,
    poRows,
    prodRows,
    finRows,
    fuelRows,
    autoRows,
    techRows,
  ] = await Promise.all([
    safe(
      (supabase as any)
        .from("service_orders")
        .select("id, order_number, status, created_at, expected_completion_at, completed_at, assigned_user_id, client, platform, vehicle_plate, total_amount")
        .eq("workspace_id", workspaceId)
        .gte("created_at", since)
        .limit(2000),
    ),
    safe(
      (supabase as any)
        .from("payment_orders")
        .select("id, status, created_at, paid_at, total_amount, assigned_user_id, client")
        .eq("workspace_id", workspaceId)
        .gte("created_at", since)
        .limit(2000),
    ),
    safe(
      (supabase as any)
        .from("production_orders")
        .select("id, order_number, status, created_at, expected_completion_at, completed_at, assigned_user_id")
        .eq("workspace_id", workspaceId)
        .gte("created_at", since)
        .limit(1000),
    ),
    safe(
      (supabase as any)
        .from("financial_records")
        .select("id, type, amount, category, created_at, assigned_user_id")
        .eq("workspace_id", workspaceId)
        .gte("created_at", since)
        .limit(3000),
    ),
    safe(
      (supabase as any)
        .from("fleet_fuel_logs")
        .select("id, vehicle_id, driver_id, liters, total_cost, km_at_fuel, date")
        .eq("workspace_id", workspaceId)
        .gte("date", since.slice(0, 10))
        .limit(2000),
    ),
    safe(
      (supabase as any)
        .from("automation_executions")
        .select("id, status, rule_id, created_at")
        .eq("workspace_id", workspaceId)
        .gte("created_at", since)
        .limit(1000),
    ),
    safe(
      (supabase as any)
        .from("profiles")
        .select("id, name, email")
        .eq("workspace_id", workspaceId)
        .limit(500),
    ),
  ]);

  const serviceOrders: CopilotServiceOrder[] = (soRows as any[]).map((r) => ({
    id: r.id,
    ref: r.order_number ?? null,
    status: String(r.status ?? ""),
    createdAt: ts(r.created_at),
    expectedAt: ts(r.expected_completion_at) || null,
    completedAt: ts(r.completed_at) || null,
    assignedTechId: r.assigned_user_id ?? null,
    client: r.client ?? null,
    platform: r.platform ?? null,
    vehiclePlate: r.vehicle_plate ?? null,
    amount: typeof r.total_amount === "number" ? r.total_amount : Number(r.total_amount) || null,
  }));

  const paymentOrders: CopilotPaymentOrder[] = (poRows as any[]).map((r) => ({
    id: r.id,
    status: String(r.status ?? ""),
    createdAt: ts(r.created_at),
    paidAt: ts(r.paid_at) || null,
    amount: typeof r.total_amount === "number" ? r.total_amount : Number(r.total_amount) || null,
    techId: r.assigned_user_id ?? null,
    client: r.client ?? null,
  }));

  const productionOrders: CopilotProductionOrder[] = (prodRows as any[]).map((r) => ({
    id: r.id,
    ref: r.order_number ?? null,
    status: String(r.status ?? ""),
    createdAt: ts(r.created_at),
    expectedAt: ts(r.expected_completion_at) || null,
    completedAt: ts(r.completed_at) || null,
    techId: r.assigned_user_id ?? null,
  }));

  const financialRecords: CopilotFinancialRecord[] = (finRows as any[]).map((r) => ({
    id: r.id,
    type: String(r.type ?? ""),
    amount: Number(r.amount) || 0,
    category: r.category ?? null,
    createdAt: ts(r.created_at),
    assignedUserId: r.assigned_user_id ?? null,
  }));

  const fuelLogs: CopilotFuelLog[] = (fuelRows as any[]).map((r) => ({
    id: r.id,
    vehicleId: r.vehicle_id ?? null,
    driverId: r.driver_id ?? null,
    liters: Number(r.liters) || 0,
    totalCost: Number(r.total_cost) || 0,
    kmAtFuel: typeof r.km_at_fuel === "number" ? r.km_at_fuel : Number(r.km_at_fuel) || null,
    date: ts(r.date) || ts((r as any).created_at) || 0,
  }));

  const automationRuns: CopilotAutomationRun[] = (autoRows as any[]).map((r) => ({
    id: r.id,
    status: String(r.status ?? ""),
    ruleId: r.rule_id ?? null,
    createdAt: ts(r.created_at),
  }));

  const technicians: CopilotTechnician[] = (techRows as any[]).map((r) => ({
    id: r.id,
    name: r.name ?? null,
    email: r.email ?? null,
  }));

  return {
    workspaceId,
    generatedAt: Date.now(),
    windowDays: WINDOW_DAYS,
    serviceOrders,
    paymentOrders,
    productionOrders,
    financialRecords,
    fuelLogs,
    automationRuns,
    technicians,
  };
}

export interface UseOperationalCopilotOptions {
  enabled?: boolean;
  refetchIntervalMs?: number;
}

export function useOperationalCopilot(opts: UseOperationalCopilotOptions = {}) {
  const { workspaceId } = useWorkspace();
  const enabled = (opts.enabled ?? true) && !!workspaceId;

  const query = useQuery<CopilotSnapshot>({
    queryKey: ["operational-copilot", workspaceId],
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchInterval: opts.refetchIntervalMs ?? 10 * 60 * 1000,
    queryFn: async () => {
      const dataset = await loadDataset(workspaceId as string);
      return OperationalCopilot.ingest(dataset);
    },
  });

  // Re-publish to subscribers even when TanStack returns from cache.
  useEffect(() => {
    if (query.data) OperationalCopilot.ingest({
      ...({} as CopilotDataset),
      // We intentionally do NOT re-ingest here on cached reads to avoid
      // double-computation; subscribers already received the snapshot when
      // the queryFn ran.
    } as any);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    snapshot: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
    refresh: () => query.refetch(),
  };
}
