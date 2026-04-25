import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";
import { useCan } from "./usePermission";
import { applyScope, logScope } from "@/lib/applyScope";
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
  assigned_user_id?: string;
  list_name?: string;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { can, isLoading: permsLoading } = useCan();
  const { allowed, scope } = can("payment_orders", "view");

  const query = useQuery({
    queryKey: ["payment_orders", filters, allowed, scope, user?.id],
    enabled: !permsLoading && allowed && !!user?.id,
    queryFn: async () => {
      logScope("payment_orders", "view", scope, allowed);
      if (!allowed) return [];

      let q: any = supabase
        .from("payment_orders")
        .select("*, clients(name), technicians(name)")
        .order("created_at", { ascending: false });

      q = applyScope(q, scope, user);

      if (filters?.client_id) q = q.eq("client_id", filters.client_id);
      if (filters?.platform) q = q.eq("platform", filters.platform);
      if (filters?.assigned_user_id) q = q.eq("assigned_user_id", filters.assigned_user_id);
      if (filters?.list_name) q = q.eq("list_name", filters.list_name);

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (orders: PaymentOrderInsert[]) => {
      if (!user?.id) throw new Error("You must be authenticated to save payment orders.");

      const payload = orders.map(o => {
        const { technician_id: _ignored, ...rest } = o as any;
        return {
          ...rest,
          created_by: rest.created_by ?? user.id,
          status: rest.status || "pending",
        };
      });

      const missingUser = payload.find((p) => !(p as any).assigned_user_id);
      if (missingUser) {
        throw new Error("assigned_user_id is required. Please select a user before saving.");
      }

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
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      toast.success("Payment orders saved successfully");
    },
    onError: (err) => {
      toast.error("Failed to save: " + (err as Error).message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PaymentOrder> & { id: string }) => {
      if (!id) throw new Error("Payment order id is required for update.");

      const updated_at = new Date().toISOString();
      const payload = { ...updates, updated_at };

      // Remove join fields that aren't columns
      delete (payload as any).clients;
      delete (payload as any).technicians;

      console.log("Updating payload:", payload);

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
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
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
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      toast.success("Payment order deleted");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return { ...query, saveMutation, updateMutation, deleteMutation };
}

const VALID_EXTRACT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];

export function useExtractPaymentOrder() {
  const [isExtracting, setIsExtracting] = useState(false);

  const extract = async (file: File): Promise<PaymentExtractionResult> => {
    setIsExtracting(true);
    try {
      // Validate file before processing
      if (!file || file.size === 0) {
        throw new Error("File is empty or invalid. Please select a valid document.");
      }
      const mimeType = file.type || guessMimeType(file.name);
      if (!VALID_EXTRACT_TYPES.includes(mimeType)) {
        throw new Error(`Unsupported file type: ${mimeType}. Please upload PDF, JPG, or PNG.`);
      }

      console.log("[Extract] Starting extraction:", { name: file.name, size: file.size, type: mimeType });

      // Upload to storage with correct contentType
      const filePath = `payment-orders/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(filePath, file, { contentType: mimeType, upsert: false });
      if (uploadError) {
        console.error("[Extract] Upload failed:", uploadError);
        throw new Error(`File upload failed: ${uploadError.message}. Please check the file and try again.`);
      }
      console.log("[Extract] File uploaded to storage:", filePath);

      // Convert to base64 for OCR
      const base64 = await fileToBase64(file);
      console.log("[Extract] Base64 ready, invoking OCR edge function...");

      // Call OCR with retry (1 retry on network failure)
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data, error } = await supabase.functions.invoke("extract-payment-order", {
            body: { imageBase64: base64, mimeType, fileName: file.name },
          });

          if (error) {
            console.error(`[Extract] Edge function error (attempt ${attempt + 1}):`, error);
            lastError = new Error(`OCR extraction failed: ${error.message}. Try re-uploading the document.`);
            if (attempt === 0) { await new Promise(r => setTimeout(r, 1500)); continue; }
            throw lastError;
          }
          if (data?.error) {
            console.error("[Extract] AI processing error:", data.error);
            throw new Error(`AI could not process this document: ${data.error}`);
          }

          console.log("[Extract] OCR success:", { orders: data?.orders?.length, confidence: data?.confidence });
          return data as PaymentExtractionResult;
        } catch (retryErr) {
          lastError = retryErr as Error;
          if (attempt === 0 && (lastError.message.includes("fetch") || lastError.message.includes("network"))) {
            console.warn("[Extract] Retrying after network error...");
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }
          throw lastError;
        }
      }
      throw lastError || new Error("OCR extraction failed after retries.");
    } catch (err) {
      console.error("[Extract] Payment order extraction error:", err);
      throw err;
    } finally {
      setIsExtracting(false);
    }
  };

  return { extract, isExtracting };
}

function guessMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png", gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
  };
  return map[ext] || "application/octet-stream";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Failed to read file. The file may be corrupted."));
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
  const { can, isLoading: permsLoading } = useCan();
  const { allowed } = can("financial", "view");
  return useQuery({
    queryKey: ["discrepancies", allowed],
    enabled: !permsLoading && allowed,
    queryFn: async () => {
      if (!allowed) return [];
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
  const { user } = useAuth();
  const { can, isLoading: permsLoading } = useCan();
  const finView = can("financial", "view");
  const soView = can("service_orders", "view");
  const poView = can("payment_orders", "view");
  const allowed = finView.allowed || soView.allowed || poView.allowed;

  return useQuery({
    queryKey: ["financial-summary", allowed, soView.scope, poView.scope, user?.id],
    enabled: !permsLoading && allowed && !!user?.id,
    queryFn: async () => {
      logScope("financial", "summary", finView.scope, allowed);
      if (!allowed) {
        return {
          expectedRevenue: 0, realRevenue: 0, difference: 0, missingMoney: 0, mismatchDiff: 0,
          totalDiscrepancies: 0, missingCount: 0, mismatchCount: 0, correctCount: 0,
          discrepancies: [], serviceOrders: [], paymentOrders: [],
        };
      }

      let soQ: any = supabase.from("service_orders").select("total, status, client_id, platform, clients(name)");
      let poQ: any = supabase.from("payment_orders").select("total, status, client_id, platform, clients(name)");
      soQ = applyScope(soQ, soView.allowed ? soView.scope : "own", user);
      poQ = applyScope(poQ, poView.allowed ? poView.scope : "own", user);

      const [soRes, poRes, discRes] = await Promise.all([
        soQ,
        poQ,
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
