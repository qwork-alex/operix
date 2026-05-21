import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";

export interface ManualTransfer {
  id: string;
  workspace_id: string;
  invoice_id: string | null;
  reference_code: string;
  amount: number;
  currency: string;
  bank_account_id: string | null;
  status: "awaiting_transfer" | "pending_manual_review" | "confirmed" | "rejected";
  payment_method: string | null;
  transfer_date: string | null;
  proof_path: string | null;
  notes: string | null;
  reviewer_notes: string | null;
  declared_at: string;
  reviewed_at: string | null;
}

export interface PlatformBankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  iban: string | null;
  bic: string | null;
  currency: string;
  country: string;
  account_type: string;
  is_primary: boolean;
  supported_methods: string[];
  active: boolean;
}

const STATUS_LABEL: Record<ManualTransfer["status"], string> = {
  awaiting_transfer: "Aguardando transferência",
  pending_manual_review: "Em análise",
  confirmed: "Aprovado",
  rejected: "Rejeitado",
};

const STATUS_TONE: Record<ManualTransfer["status"], string> = {
  awaiting_transfer: "text-sky-400",
  pending_manual_review: "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.45)]",
  confirmed: "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.45)]",
  rejected: "text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]",
};

export function statusMeta(s: ManualTransfer["status"]) {
  return { label: STATUS_LABEL[s], tone: STATUS_TONE[s] };
}

/** Active bank accounts — used by the dialog to show payable destinations. */
export function useBankAccounts(vatMode?: string | null) {
  return useQuery({
    queryKey: ["platform-bank-accounts-public", vatMode ?? null],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("platform_bank_accounts")
        .select("*")
        .eq("active", true)
        .order("is_primary", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as PlatformBankAccount[];
      // Routing: no_vat → wise personal; with_vat / reverse_charge → business
      if (vatMode === "no_vat") {
        const personal = rows.filter((r) => r.account_type === "personal");
        return personal.length ? personal : rows;
      }
      if (vatMode) {
        const business = rows.filter((r) => r.account_type === "business");
        return business.length ? business : rows;
      }
      return rows;
    },
  });
}

/** Workspace transfers (for the current workspace). */
export function useWorkspaceManualTransfers(invoiceId?: string) {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["manual-transfers", workspaceId, invoiceId ?? "all"],
    enabled: !!workspaceId,
    staleTime: 15_000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("manual_bank_transfers")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("declared_at", { ascending: false });
      if (invoiceId) q = q.eq("invoice_id", invoiceId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ManualTransfer[];
    },
  });
}

/** All pending transfers across workspaces (owner review). */
export function useAdminPendingTransfers() {
  return useQuery({
    queryKey: ["manual-transfers-admin-pending"],
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("manual_bank_transfers")
        .select("*, workspaces(name), platform_invoices(invoice_number, total)")
        .in("status", ["awaiting_transfer", "pending_manual_review"])
        .order("declared_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useSubmitManualTransfer() {
  const qc = useQueryClient();
  const { workspaceId } = useWorkspace();
  return useMutation({
    mutationFn: async (input: {
      invoice_id: string | null;
      amount: number;
      currency: string;
      payment_method: string;
      bank_account_id: string | null;
      transfer_date: string | null;
      proof_path: string | null;
      notes: string | null;
    }) => {
      if (!workspaceId) throw new Error("workspace not loaded");
      const { data, error } = await (supabase as any).rpc("submit_manual_transfer", {
        _workspace_id: workspaceId,
        _invoice_id: input.invoice_id,
        _amount: input.amount,
        _currency: input.currency,
        _payment_method: input.payment_method,
        _bank_account_id: input.bank_account_id,
        _transfer_date: input.transfer_date,
        _proof_path: input.proof_path,
        _notes: input.notes,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-transfers"] });
      qc.invalidateQueries({ queryKey: ["workspace-invoices"] });
    },
  });
}

export function useApproveManualTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { error } = await (supabase as any).rpc("approve_manual_transfer", {
        _transfer_id: id,
        _notes: notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-transfers-admin-pending"] });
      qc.invalidateQueries({ queryKey: ["manual-transfers"] });
      qc.invalidateQueries({ queryKey: ["workspace-invoices"] });
      qc.invalidateQueries({ queryKey: ["platform-payments"] });
    },
  });
}

export function useRejectManualTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await (supabase as any).rpc("reject_manual_transfer", {
        _transfer_id: id,
        _reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-transfers-admin-pending"] });
      qc.invalidateQueries({ queryKey: ["manual-transfers"] });
    },
  });
}

/** Upload a proof file under {workspace_id}/{invoice_id|misc}/timestamp-name. Returns the storage path. */
export async function uploadPaymentProof(workspaceId: string, invoiceId: string | null, file: File): Promise<string> {
  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${workspaceId}/${invoiceId ?? "misc"}/${ts}-${safeName}`;
  const { error } = await supabase.storage.from("payment-proofs").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw error;
  return path;
}

export async function signedProofUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}
