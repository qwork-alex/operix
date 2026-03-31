import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type ServiceOrder = Tables<"service_orders">;
export type ServiceOrderInsert = TablesInsert<"service_orders">;

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
  handwritten_corrections?: { field: string; original_value?: string; corrected_value: string }[];
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

  const query = useQuery({
    queryKey: ["service_orders", filters],
    queryFn: async () => {
      let q = supabase
        .from("service_orders")
        .select("*, clients(name), technicians(name)")
        .order("created_at", { ascending: false });

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
      const { data, error } = await supabase
        .from("service_orders")
        .insert(orders.map(o => ({ ...o, created_by: user?.id })))
        .select();
      if (error) throw error;
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
      const { data, error } = await supabase
        .from("service_orders")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
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
      // Upload file to storage
      const filePath = `service-orders/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      // Convert to base64 for AI
      const base64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke("extract-service-order", {
        body: {
          imageBase64: base64,
          mimeType: file.type,
          fileName: file.name,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as ExtractionResult;
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
