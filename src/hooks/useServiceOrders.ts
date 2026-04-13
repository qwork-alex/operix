import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";
import { useRole } from "./useRole";
import { toast } from "sonner";

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
  technician_id?: string;
  week?: string;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isAdmin } = useRole();

  const hasRequiredAuditFields = (payload: {
    id?: string;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  }) => Boolean(payload.id && payload.created_by && payload.created_at && payload.updated_at);

  const query = useQuery({
    queryKey: ["service_orders", filters, isAdmin, user?.id],
    queryFn: async () => {
      let q = supabase
        .from("service_orders")
        .select("*, clients(name), technicians(name)")
        .order("created_at", { ascending: false });

      // Non-admin users see only their own data
      if (!isAdmin && user?.id) {
        q = q.eq("created_by", user.id);
      }

      if (filters?.client_id) q = q.eq("client_id", filters.client_id);
      if (filters?.platform) q = q.eq("platform", filters.platform);
      if (filters?.technician_id) q = q.eq("technician_id", filters.technician_id);
      if (filters?.week) q = q.eq("week", filters.week);

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (orders: ServiceOrderInsert[]) => {
      if (!user?.id) throw new Error("You must be authenticated to save service orders.");

      const payload = orders.map(o => ({
        id: o.id ?? crypto.randomUUID(),
        ...o,
        created_by: o.created_by ?? user.id,
        created_at: o.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: o.status || "draft",
      }));

      const invalid = payload.find((p) => !hasRequiredAuditFields(p));
      if (invalid) throw new Error("Missing required audit fields (id, created_by, created_at, updated_at).");

      console.log("Saving payload:", payload);

      const { data, error } = await supabase
        .from("service_orders")
        .insert(payload)
        .select();
      if (error) {
        console.error("[ServiceOrders] Insert error:", error);
        throw error;
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

      // Fetch FULL existing record to merge — prevents data loss
      const { data: existing, error: existingError } = await supabase
        .from("service_orders")
        .select("*")
        .eq("id", id)
        .single();

      if (existingError) throw existingError;

      // Merge: existing record + caller updates
      const payload = {
        ...existing,
        ...updates,
        id,
        created_by: updates.created_by ?? existing.created_by ?? user?.id,
        created_at: updates.created_at ?? existing.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client_name: (updates as any).client_name ?? (existing as any).client_name ?? "",
        technician_name: (updates as any).technician_name ?? (existing as any).technician_name ?? "",
      };

      // Remove joined relations that come from select("*, clients(...)")
      delete (payload as any).clients;
      delete (payload as any).technicians;

      if (!hasRequiredAuditFields(payload)) {
        throw new Error("Missing required audit fields (id, created_by, created_at, updated_at).");
      }

      console.log("Saving payload:", payload);

      const { data, error } = await supabase
        .from("service_orders")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) {
        console.error("[ServiceOrders] Update error:", error);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
    },
    onError: (err) => {
      console.error("[ServiceOrders] Update error:", err);
      toast.error("Failed to update: " + (err as Error).message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_orders").delete().eq("id", id);
      if (error) throw error;
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

export function useExtractServiceOrder() {
  const [isExtracting, setIsExtracting] = useState(false);

  const extract = async (file: File): Promise<ExtractionResult> => {
    setIsExtracting(true);
    try {
      const filePath = `service-orders/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(filePath, file);
      if (uploadError) {
        console.error("[Extract] Upload failed:", uploadError);
        throw new Error(`File upload failed: ${uploadError.message}. Please check the file and try again.`);
      }

      const base64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke("extract-service-order", {
        body: {
          imageBase64: base64,
          mimeType: file.type,
          fileName: file.name,
        },
      });

      if (error) {
        console.error("[Extract] Edge function error:", error);
        throw new Error(`OCR extraction failed: ${error.message}. Try re-uploading the document.`);
      }
      if (data?.error) {
        console.error("[Extract] AI processing error:", data.error);
        throw new Error(`AI could not process this document: ${data.error}`);
      }
      return data as ExtractionResult;
    } catch (err) {
      console.error("[Extract] Service order extraction error:", err);
      throw err;
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
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useTechnicians() {
  return useQuery({
    queryKey: ["technicians"],
    queryFn: async () => {
      const { data, error } = await supabase.from("technicians").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });
}
