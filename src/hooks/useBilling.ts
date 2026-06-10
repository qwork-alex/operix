import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
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
  vat_mode?: "with_vat" | "no_vat" | "reverse_charge";
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
      const data = await apiRequest<{ profile: BillingProfile | null }>(
        `/billing/workspaces/${workspaceId}/profile`,
      );
      return data.profile;
    },
  });
}

export function useSaveBillingProfile() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<BillingProfile>) => {
      if (!workspaceId) throw new Error("no workspace");
      const data = await apiRequest<{ profile: BillingProfile }>(`/billing/workspaces/${workspaceId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return data.profile;
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
      const data = await apiRequest<{ methods: PaymentMethod[] }>(
        `/billing/workspaces/${workspaceId}/payment-methods`,
      );
      return data.methods ?? [];
    },
  });
}

export function useAddPaymentMethod() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pm: Partial<PaymentMethod>) => {
      if (!workspaceId) throw new Error("no workspace");
      const data = await apiRequest<{ method: PaymentMethod }>(
        `/billing/workspaces/${workspaceId}/payment-methods`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pm),
        },
      );
      return data.method;
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
      const data = await apiRequest<{ events: any[] }>(
        `/billing/workspaces/${workspaceId}/subscription-events?limit=${limit}`,
      );
      return data.events ?? [];
    },
  });
}

export function useStartCheckout() {
  const { workspaceId } = useWorkspace();
  return useMutation({
    mutationFn: async (args: { plan_code: string; cycle: "monthly" | "yearly" }) => {
      if (!workspaceId) throw new Error("no workspace");
      return {
        workspace_id: workspaceId,
        lookup_key: `${args.plan_code}_${args.cycle}`,
      };
    },
  });
}

export function useDeclareManualTransfer() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { amount: number; currency?: string; invoice_id?: string; bank_account_id?: string }) => {
      if (!workspaceId) throw new Error("no workspace");
      const data = await apiRequest<{ transfer: any }>(`/billing/workspaces/${workspaceId}/manual-transfers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return data.transfer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-transfers"] });
      qc.invalidateQueries({ queryKey: ["subscription-events"] });
      toast.success("Transferência registada — aguarda revisão manual");
    },
    onError: (e: any) => toast.error(e.message || "Erro"),
  });
}
