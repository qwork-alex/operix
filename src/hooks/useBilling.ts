import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";
import { toast } from "sonner";

export interface BillingProfile {
  id: string;
  workspace_id: string;
  legal_name: string;
  company_name: string | null;
  billing_email: string;
  billing_address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string;
  vat_number: string | null;
  is_business: boolean;
  preferred_currency: string;
}

export interface PaymentMethod {
  id: string;
  workspace_id: string;
  kind: "card" | "sepa" | "manual_transfer";
  brand: string | null;
  last4: string | null;
  holder_name: string | null;
  iban_masked: string | null;
  is_default: boolean;
  provider: string;
}

export function useBillingProfile() {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["billing-profile", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_profiles")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return data as BillingProfile | null;
    },
  });
}

export function useSaveBillingProfile() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<BillingProfile>) => {
      if (!workspaceId) throw new Error("no workspace");
      const { data, error } = await supabase
        .from("billing_profiles")
        .upsert({ ...payload, workspace_id: workspaceId } as any, { onConflict: "workspace_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing-profile", workspaceId] });
      toast.success("Perfil de faturação guardado");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao guardar"),
  });
}

export function usePaymentMethods() {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["payment-methods", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentMethod[];
    },
  });
}

export function useAddPaymentMethod() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pm: Partial<PaymentMethod>) => {
      if (!workspaceId) throw new Error("no workspace");
      const { data, error } = await supabase
        .from("payment_methods")
        .insert({ ...pm, workspace_id: workspaceId, provider: "mock" } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-methods", workspaceId] });
      toast.success("Método de pagamento adicionado");
    },
    onError: (e: any) => toast.error(e.message || "Erro"),
  });
}

export function useSubscriptionEvents(limit = 50) {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["subscription-events", workspaceId, limit],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_events")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStartCheckout() {
  const { workspaceId } = useWorkspace();
  return useMutation({
    mutationFn: async (args: { plan_code: string; cycle: "monthly" | "yearly" }) => {
      if (!workspaceId) throw new Error("no workspace");
      const { data, error } = await supabase.rpc("start_workspace_checkout", {
        _workspace_id: workspaceId,
        _plan_code: args.plan_code,
        _cycle: args.cycle,
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useDeclareManualTransfer() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { amount: number; currency?: string; invoice_id?: string; bank_account_id?: string }) => {
      if (!workspaceId) throw new Error("no workspace");
      const ref = `MBT-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await supabase
        .from("manual_bank_transfers")
        .insert({
          workspace_id: workspaceId,
          reference_code: ref,
          amount: args.amount,
          currency: args.currency ?? "EUR",
          invoice_id: args.invoice_id ?? null,
          bank_account_id: args.bank_account_id ?? null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      await supabase.rpc("log_subscription_event", {
        _workspace_id: workspaceId,
        _event_type: "manual_transfer_declared",
        _severity: "info",
        _message: "Transferência bancária declarada (aguardando revisão)",
        _metadata: { reference: ref, amount: args.amount } as any,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-transfers"] });
      qc.invalidateQueries({ queryKey: ["subscription-events"] });
      toast.success("Transferência registada — aguarda revisão manual");
    },
    onError: (e: any) => toast.error(e.message || "Erro"),
  });
}
