import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RealtimeHub } from "@/lib/realtime/RealtimeHub";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";
import { useCan } from "./usePermission";
import { applyScope, logScope } from "@/lib/applyScope";
import { useWorkspace } from "./useWorkspace";
import { scopeQuery } from "@/lib/workspaceScope";
import { getCurrentUserId, logSaveError, logSavePayload } from "@/lib/authUser";
import { toast } from "sonner";
import { withAbortableTimeout, withPromiseTimeout } from "@/lib/asyncGuard";
import { pdfFirstPageToImageBase64 } from "@/lib/pdfUtils";

export type ServiceOrder = Tables<"service_orders">;
export type ServiceOrderInsert = TablesInsert<"service_orders">;

export type FieldConfidence = "high" | "medium" | "low";

export interface ExtractedOrder {
  client: string | null;
  platform: string | null;
  technician: string | null;
  week: string | null;
  car_name: string | null;
  license_plate: string | null;
  service_1_name: string | null;
  service_1_price: number | null;
  service_2_name: string | null;
  service_2_price: number | null;
  service_3_name: string | null;
  service_3_price: number | null;
  service_4_name: string | null;
  service_4_price: number | null;
  total: number | null;
  field_confidence?: Partial<Record<string, FieldConfidence>>;
  handwritten_corrections?: { field: string; original_value?: string; corrected_value: string }[];
  total_mismatch?: boolean;
}

export interface ExtractionResult {
  orders: ExtractedOrder[];
  confidence: "high" | "medium" | "low";
  notes?: string;
}

export function useServiceOrders(filters?: {
  client_id?: string;
  platform?: string;
  assigned_user_id?: string;
  week?: string;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { can, isLoading: permsLoading } = useCan();
  const { workspaceId } = useWorkspace();

  const hasRequiredAuditFields = (payload: {
    id?: string;
    created_at?: string;
    updated_at?: string;
  }) => Boolean(payload.id && payload.created_at && payload.updated_at);

  const { allowed, scope } = can("service_orders", "view");

  const query = useQuery({
    queryKey: ["service_orders", workspaceId, filters, allowed, scope, user?.id],
    enabled: !permsLoading && allowed && !!user?.id,
    retry: 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: (previousData) => previousData ?? [],
    queryFn: async () => {
      logScope("service_orders", "view", scope, allowed);
      if (!allowed) return [];

      let q: any = supabase
        .from("service_orders")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });

      q = applyScope(q, scope, user, "user_id");
      q = scopeQuery(q, "service_orders", workspaceId);

      if (filters?.client_id) q = q.eq("client_id", filters.client_id);
      if (filters?.platform) q = q.eq("platform", filters.platform);
      if (filters?.assigned_user_id) q = q.eq("assigned_user_id", filters.assigned_user_id);
      if (filters?.week) q = q.eq("week", filters.week);

      const { data, error } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) => (q as any).abortSignal(signal),
        10000,
        "service_orders",
      );
      if (error) throw error;
      return data;
    },
  });

  // Real-time: refresh service orders when payment_orders change (shared via RealtimeHub)
  useEffect(() => {
    const off = RealtimeHub.subscribe(
      { table: "payment_orders", workspaceId: workspaceId ?? undefined },
      () => queryClient.invalidateQueries({ queryKey: ["service_orders"] }),
    );
    return off;
  }, [queryClient, workspaceId]);

  const saveMutation = useMutation({
    mutationFn: async (orders: ServiceOrderInsert[]) => {
      const currentUserId = await getCurrentUserId();

      const payload = orders.map(o => {
        const {
          technician_id: _ignored,
          created_by: _ignoredCreatedBy,
          ...rest
        } = o as any;
        return {
          id: rest.id ?? crypto.randomUUID(),
          ...rest,
          created_at: rest.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: rest.status || "draft",
        };
      });

      const invalid = payload.find((p) => !hasRequiredAuditFields(p));
      if (invalid) throw new Error("Missing required audit fields (id, created_at, updated_at).");

      logSavePayload("ServiceOrders:insert", currentUserId, payload);

      const { data, error } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) =>
          ((supabase as any)
            .from("service_orders")
            .insert(payload)
            .select() as any).abortSignal(signal),
        12000,
        "service_orders_insert",
      );
      if (error) {
        logSaveError("ServiceOrders:insert", error);
        throw error;
      }

      // Auto-generate service_order_distributions from active profit rules (group-based)
      if (data && data.length > 0) {
        try {
          const groupIds = [...new Set(data.map(so => so.group_id).filter(Boolean))];
          if (groupIds.length > 0) {
            const { data: profitRules } = await withAbortableTimeout<{ data: any; error: any }>(
              async (signal) =>
                (supabase
                  .from("profit_rules")
                  .select("group_ids, profit_rule_items(participant_name, percentage, participant_type)")
                  .eq("is_active", true) as any).abortSignal(signal),
              12000,
              "service_orders_profit_rules",
            );

            if (profitRules && profitRules.length > 0) {
              // Build map: group_id -> rule items (using group_ids array)
              const ruleMap = new Map<string, any[]>();
              for (const r of profitRules) {
                const ruleGroupIds = (r as any).group_ids || [];
                const items = (r as any).profit_rule_items || [];
                for (const gid of ruleGroupIds) {
                  if (groupIds.includes(gid)) {
                    ruleMap.set(gid, items);
                  }
                }
              }
              const distributions: any[] = [];
              for (const so of data) {
                const items = ruleMap.get(so.group_id!);
                if (!items || !so.group_id) continue;
                const total = Number(so.total || 0);
                for (const item of items) {
                  distributions.push({
                    service_order_id: so.id,
                    participant_name: item.participant_name,
                    percentage: item.percentage,
                    calculated_value: Math.round(total * Number(item.percentage) / 100 * 100) / 100,
                  });
                }
              }
              if (distributions.length > 0) {
                await withAbortableTimeout<{ data: any; error: any }>(
                  async (signal) =>
                    (supabase.from("service_order_distributions").insert(distributions) as any).abortSignal(signal),
                  12000,
                  "service_order_distributions_insert",
                );
              }
            }
          }
        } catch (distErr) {
          void distErr;
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      toast.success("Service orders saved successfully");
    },
    onError: (err) => {
      toast.error("Failed to save: " + (err as Error).message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ServiceOrder> & { id: string }) => {
      if (!id) throw new Error("Service order id is required for update.");
      const currentUserId = await getCurrentUserId();

      // Fetch FULL existing record to merge — prevents data loss
      const { data: existing, error: existingError } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) =>
          (supabase
            .from("service_orders")
            .select("*")
            .eq("id", id)
            .single() as any).abortSignal(signal),
        12000,
        "service_orders_fetch_existing",
      );

      if (existingError) throw existingError;

      // Merge: existing record + caller updates
      const payload = {
        ...existing,
        ...updates,
        id,
        user_id: (existing as any).user_id ?? currentUserId,
        assigned_user_id: (existing as any).assigned_user_id ?? currentUserId,
        created_by: existing.created_by ?? currentUserId,
        created_at: updates.created_at ?? existing.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client_name: (updates as any).client_name ?? (existing as any).client_name ?? "",
        technician_name: (updates as any).technician_name ?? (existing as any).technician_name ?? "",
      };

      // Remove joined relations that come from select("*, clients(...)")
      delete (payload as any).clients;
      delete (payload as any).technicians;
      delete (payload as any).created_by;
      // Hard rule: technician_id is never accepted on writes
      delete (payload as any).technician_id;

      if (!hasRequiredAuditFields(payload)) {
        throw new Error("Missing required audit fields (id, created_at, updated_at).");
      }

      logSavePayload("ServiceOrders:update", currentUserId, payload);

      const { data, error } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) =>
          ((supabase as any)
            .from("service_orders")
            .update(payload)
            .eq("id", id)
            .select()
            .single() as any).abortSignal(signal),
        12000,
        "service_orders_update",
      );
      if (error) {
        logSaveError("ServiceOrders:update", error);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
    },
    onError: (err) => {
      toast.error("Failed to update: " + (err as Error).message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { assertedDelete } = await import("@/lib/assertDelete");
      await assertedDelete("service_orders", (q) => q.eq("id", id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
    },
    onError: (err) => {
      toast.error("Failed to delete: " + (err as Error).message);
    },
  });

  return { ...query, saveMutation, updateMutation, deleteMutation };
}

const EXTRACT_API_URL = (import.meta.env.VITE_API_URL ?? "/api") + "/extract/service-order";

export function useExtractServiceOrder() {
  const [isExtracting, setIsExtracting] = useState(false);

  const extract = async (file: File): Promise<ExtractionResult> => {
    setIsExtracting(true);
    try {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const input = isPdf
        ? await pdfFirstPageToImageBase64(file, { maxWidth: 1600, quality: 0.9 })
        : { base64: await fileToBase64(file), mimeType: (file.type || "application/octet-stream") as string };

      const res = await withPromiseTimeout<Response>(
        fetch(EXTRACT_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: input.base64, mimeType: input.mimeType, fileName: file.name }),
        }),
        30000,
        "extract_service_order",
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? `Erro ${res.status}`);
      }

      return res.json() as Promise<ExtractionResult>;
    } finally {
      setIsExtracting(false);
    }
  };

  return { extract, isExtracting };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    retry: 0,
    placeholderData: (previousData) => previousData ?? [],
    queryFn: async () => {
      const { data, error } = await withPromiseTimeout<any>(supabase.from("clients").select("id, name").order("name"), 8000, "clients");
      if (error) throw error;
      return data;
    },
  });
}

// NOTE: legacy `useTechnicians` and `useMyTechnicianId` hooks were removed.
// The system now uses `assigned_user_id` (auth.users.id) as the single source
// of truth. Use `useAssignableUsers` and `useMyAssignableUserId` from
// `@/hooks/useAssignableUsers` instead.
