import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useCan } from "./usePermission";
import { useWorkspace } from "./useWorkspace";
import { toast } from "sonner";
import { withPromiseTimeout } from "@/lib/asyncGuard";
import { pdfFirstPageToImageBase64 } from "@/lib/pdfUtils";
import {
  listServiceOrders,
  createServiceOrders,
  putServiceOrder,
  deleteServiceOrder,
  listClients,
  type ServiceOrderRecord,
} from "@/lib/apiServiceOrders";

export type ServiceOrder = ServiceOrderRecord;
export type ServiceOrderInsert = Partial<ServiceOrderRecord> & { id?: string };

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

  const { allowed } = can("service_orders", "view");

  const query = useQuery({
    queryKey: ["service_orders", workspaceId, filters, allowed, user?.id],
    enabled: !permsLoading && allowed && !!user?.id && !!workspaceId,
    retry: 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: (previousData) => previousData ?? [],
    queryFn: () =>
      listServiceOrders(workspaceId!, {
        client_id: filters?.client_id,
        platform: filters?.platform,
        week: filters?.week,
        assigned_user_id: filters?.assigned_user_id,
      }),
  });

  const saveMutation = useMutation({
    mutationFn: async (orders: ServiceOrderInsert[]) => {
      const payload = orders.map((o) => ({
        ...o,
        id: o.id ?? crypto.randomUUID(),
        user_id: o.user_id ?? user?.id ?? "",
        assigned_user_id: o.assigned_user_id ?? user?.id ?? "",
        workspace_id: o.workspace_id ?? workspaceId,
        created_at: o.created_at ?? new Date().toISOString(),
        status: o.status ?? "draft",
        client_name: o.client_name ?? "",
        technician_name: o.technician_name ?? "",
      }));
      return createServiceOrders(payload as any);
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
      const payload: Record<string, unknown> = {
        ...updates,
        id,
        user_id: updates.user_id ?? user?.id ?? "",
        assigned_user_id: updates.assigned_user_id ?? user?.id ?? "",
        workspace_id: updates.workspace_id ?? workspaceId,
        client_name: updates.client_name ?? "",
        technician_name: updates.technician_name ?? "",
        created_at: updates.created_at ?? new Date().toISOString(),
      };
      return putServiceOrder(id, payload);
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
    mutationFn: (id: string) => deleteServiceOrder(id),
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
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["clients", workspaceId],
    retry: 0,
    placeholderData: (previousData) => previousData ?? [],
    queryFn: () => listClients(workspaceId ?? undefined),
  });
}
