import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";
import { useWorkspace } from "./useWorkspace";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export type PaymentOrder = Tables<"payment_orders">;
export type PaymentOrderInsert = TablesInsert<"payment_orders">;

export type FieldConfidence = "high" | "medium" | "low";

export interface ExtractedPaymentOrder {
  client: string | null;
  platform: string | null;
  list_name: string | null;
  technician: string | null;
  car_name: string | null;
  license_plate: string | null;
  services: { name: string; price: number; confidence?: FieldConfidence }[];
  total: number | null;
  field_confidence?: Partial<Record<string, FieldConfidence>>;
  handwritten_corrections?: { field: string; original_value?: string; corrected_value: string }[];
  total_mismatch?: boolean;
}

export interface PaymentExtractionResult {
  orders: ExtractedPaymentOrder[];
  confidence: "high" | "medium" | "low";
  notes?: string;
}

export function usePaymentOrders(filters?: {
  client_id?: string;
  platform?: string;
  technician_id?: string;
  list_name?: string;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { memberAuthIds, isAdmin } = useWorkspace();

  const hasRequiredAuditFields = (payload: {
    id?: string;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  }) => Boolean(payload.id && payload.created_by && payload.created_at && payload.updated_at);

  const query = useQuery({
    queryKey: ["payment_orders", filters, memberAuthIds, isAdmin, user?.id],
    queryFn: async () => {
      let q = supabase
        .from("payment_orders")
        .select("*, clients(name), technicians(name)")
        .order("created_at", { ascending: false });

      if (!isAdmin && user?.id) {
        q = q.eq("created_by", user.id);
      } else if (isAdmin && memberAuthIds.length > 0) {
        q = q.in("created_by", memberAuthIds);
      }

      if (filters?.client_id) q = q.eq("client_id", filters.client_id);
      if (filters?.platform) q = q.eq("platform", filters.platform);
      if (filters?.technician_id) q = q.eq("technician_id", filters.technician_id);
      if (filters?.list_name) q = q.eq("list_name", filters.list_name);

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (orders: PaymentOrderInsert[]) => {
      if (!user?.id) throw new Error("You must be authenticated to save payment orders.");

      const payload = orders.map(o => ({
        id: o.id ?? crypto.randomUUID(),
        ...o,
        created_by: o.created_by ?? user.id,
        created_at: o.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: o.status || "pending",
      }));

      const invalid = payload.find((p) => !hasRequiredAuditFields(p));
      if (invalid) throw new Error("Missing required audit fields (id, created_by, created_at, updated_at).");

      console.log("Saving payload:", payload);

      const { data, error } = await supabase
        .from("payment_orders")
        .insert(payload)
        .select();
      if (error) {
        console.error("[PaymentOrders] Insert error:", error);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_orders"] });
      toast.success("Payment orders saved successfully");
    },
    onError: (err) => {
      toast.error("Failed to save: " + (err as Error).message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PaymentOrder> & { id: string }) => {
      if (!id) throw new Error("Payment order id is required for update.");

      const { data: existing, error: existingError } = await supabase
        .from("payment_orders")
        .select("id, created_by, created_at")
        .eq("id", id)
        .single();

      if (existingError) throw existingError;

      const created_by = updates.created_by ?? existing.created_by ?? user?.id;
      const created_at = updates.created_at ?? existing.created_at ?? new Date().toISOString();
      const updated_at = new Date().toISOString();

      const requiredAudit = { id, created_by, created_at, updated_at };
      if (!hasRequiredAuditFields(requiredAudit)) {
        throw new Error("Missing required audit fields (id, created_by, created_at, updated_at).");
      }

      const payload = { ...updates, created_by, created_at, updated_at };
      console.log("Saving payload:", payload);

      const { data, error } = await supabase
        .from("payment_orders")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) {
        console.error("[PaymentOrders] Update error:", error);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      toast.success("Payment order updated");
    },
    onError: (err) => {
      console.error("[PaymentOrders] Update error:", err);
      toast.error("Failed to update: " + (err as Error).message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payment_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      toast.success("Payment order deleted");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return { ...query, saveMutation, updateMutation, deleteMutation };
}

export function useExtractPaymentOrder() {
  const [isExtracting, setIsExtracting] = useState(false);

  const extract = async (file: File): Promise<PaymentExtractionResult> => {
    setIsExtracting(true);
    try {
      const filePath = `payment-orders/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(filePath, file);
      if (uploadError) {
        console.error("[Extract] Upload failed:", uploadError);
        throw new Error(`File upload failed: ${uploadError.message}. Please check the file and try again.`);
      }

      const base64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke("extract-payment-order", {
        body: { imageBase64: base64, mimeType: file.type, fileName: file.name },
      });

      if (error) {
        console.error("[Extract] Edge function error:", error);
        throw new Error(`OCR extraction failed: ${error.message}. Try re-uploading the document.`);
      }
      if (data?.error) {
        console.error("[Extract] AI processing error:", data.error);
        throw new Error(`AI could not process this document: ${data.error}`);
      }
      return data as PaymentExtractionResult;
    } catch (err) {
      console.error("[Extract] Payment order extraction error:", err);
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

export function useDiscrepancyDetection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("detect-discrepancies");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["discrepancies"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      if (data.total === 0) {
        toast.success("No discrepancies found — all payments match.");
      } else {
        toast.warning(`Found ${data.total} discrepancies: ${data.missing} missing, ${data.mismatches} mismatches.`);
      }
    },
    onError: (err) => {
      toast.error("Detection failed: " + (err as Error).message);
    },
  });
}

export function useDiscrepancies() {
  return useQuery({
    queryKey: ["discrepancies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discrepancies")
        .select("*, service_orders(license_plate, car_name, total, platform, clients(name)), payment_orders(license_plate, car_name, total, platform, clients(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useFinancialSummary() {
  return useQuery({
    queryKey: ["financial-summary"],
    queryFn: async () => {
      const [soRes, poRes, discRes] = await Promise.all([
        supabase.from("service_orders").select("total, status, client_id, platform, clients(name)"),
        supabase.from("payment_orders").select("total, status, client_id, platform, clients(name)"),
        supabase.from("discrepancies").select("*, service_orders(total, clients(name)), payment_orders(total, clients(name))"),
      ]);

      const serviceOrders = soRes.data ?? [];
      const paymentOrders = poRes.data ?? [];
      const discrepancies = discRes.data ?? [];

      const expectedRevenue = serviceOrders.reduce((s, o) => s + Number(o.total || 0), 0);
      const realRevenue = paymentOrders.reduce((s, o) => s + Number(o.total || 0), 0);
      const difference = expectedRevenue - realRevenue;

      const unresolvedDisc = discrepancies.filter(d => !d.resolved);
      const missingPayments = unresolvedDisc.filter(d => d.issue_type === "missing" && d.service_order_id);
      const missingMoney = missingPayments.reduce((s, d) => s + Number(d.expected_value || 0), 0);
      const mismatches = unresolvedDisc.filter(d => d.issue_type === "value_mismatch");
      const mismatchDiff = mismatches.reduce((s, d) => s + (Number(d.expected_value || 0) - Number(d.received_value || 0)), 0);

      return {
        expectedRevenue,
        realRevenue,
        difference,
        missingMoney,
        mismatchDiff,
        totalDiscrepancies: unresolvedDisc.length,
        missingCount: missingPayments.length,
        mismatchCount: mismatches.length,
        correctCount: serviceOrders.length - missingPayments.length - mismatches.length,
        discrepancies: unresolvedDisc,
        serviceOrders,
        paymentOrders,
      };
    },
  });
}
