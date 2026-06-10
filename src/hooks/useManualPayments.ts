import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
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
  proof_name?: string | null;
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
  supported_methods?: string[];
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
      const qs = vatMode ? `?vatMode=${encodeURIComponent(vatMode)}` : "";
      const data = await apiRequest<{ accounts: PlatformBankAccount[] }>(`/billing/platform-bank-accounts${qs}`);
      const rows = data.accounts ?? [];
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
      const qs = invoiceId ? `?invoiceId=${encodeURIComponent(invoiceId)}` : "";
      const data = await apiRequest<{ transfers: ManualTransfer[] }>(
        `/billing/workspaces/${workspaceId}/manual-transfers${qs}`,
      );
      return data.transfers ?? [];
    },
  });
}

/** All pending transfers across workspaces (owner review). */
export function useAdminPendingTransfers() {
  return useQuery({
    queryKey: ["manual-transfers-admin-pending"],
    staleTime: 10_000,
    queryFn: async () => {
      const data = await apiRequest<{ transfers: any[] }>("/billing/admin/manual-transfers/pending");
      return data.transfers ?? [];
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
      proof_name?: string | null;
      notes: string | null;
    }) => {
      if (!workspaceId) throw new Error("workspace not loaded");
      const data = await apiRequest<{ transfer: ManualTransfer }>(
        `/billing/workspaces/${workspaceId}/manual-transfers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return data.transfer.id;
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
      await apiRequest(`/billing/admin/manual-transfers/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes ?? null }),
      });
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
      await apiRequest(`/billing/admin/manual-transfers/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: reason ?? null }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-transfers-admin-pending"] });
      qc.invalidateQueries({ queryKey: ["manual-transfers"] });
    },
  });
}

/**
 * Transitional proof handling without Supabase Storage.
 * Files are serialized client-side into data URLs and stored with the transfer.
 */
export async function uploadPaymentProof(_workspaceId: string, _invoiceId: string | null, file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Falha ao ler o ficheiro"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o ficheiro"));
    reader.readAsDataURL(file);
  });
}

export async function signedProofUrl(path: string, expiresIn = 3600): Promise<string | null> {
  void expiresIn;
  return path || null;
}
