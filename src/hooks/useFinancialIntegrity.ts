import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getIntegrityIssues, getIntegritySnapshots, runIntegrityCheck } from "@/lib/apiFinance";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";

export type IntegrityIssue = {
  id: string;
  workspace_id: string | null;
  year_reference: number | null;
  severity: "info" | "warning" | "critical";
  issue_type: string;
  entity_type: string | null;
  entity_id: string | null;
  reference_id: string | null;
  detected_at: string;
  resolved_at: string | null;
  status: "open" | "investigating" | "ignored" | "resolved";
  details_json: Record<string, unknown>;
  hash: string | null;
};

export type IntegritySnapshot = {
  id: string;
  workspace_id: string | null;
  year_reference: number;
  snapshot_type: string;
  total_received: number;
  total_expected: number;
  total_pending: number;
  total_distributed: number;
  total_expenses: number;
  total_profit: number;
  total_os: number;
  total_op: number;
  created_at: string;
};

export type IntegrityFilters = {
  year?: number;
  severity?: "info" | "warning" | "critical" | "all";
  issueType?: string | "all";
  status?: "open" | "investigating" | "ignored" | "resolved" | "all";
};

export function useFinancialIntegrity(filters: IntegrityFilters = {}) {
  const { workspaceId } = useWorkspace();
  const year = filters.year ?? new Date().getFullYear();

  const issues = useQuery({
    queryKey: ["integrity-issues", workspaceId, year, filters],
    enabled: !!workspaceId,
    retry: 0,
    queryFn: async () => {
      const data = await getIntegrityIssues({
        year,
        severity: filters.severity,
        issueType: filters.issueType,
        status: filters.status,
      });
      return (data ?? []) as IntegrityIssue[];
    },
  });

  const snapshots = useQuery({
    queryKey: ["integrity-snapshots", workspaceId, year],
    enabled: !!workspaceId,
    retry: 0,
    queryFn: async () => {
      const data = await getIntegritySnapshots(year);
      return (data ?? []) as IntegritySnapshot[];
    },
  });

  return { issues, snapshots, year };
}

export function useRunIntegrityCheck() {
  const qc = useQueryClient();
  const { workspaceId } = useWorkspace();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: async (year?: number) => {
      const data = await runIntegrityCheck(year ?? new Date().getFullYear());
      return data as {
        run_id: string; critical: number; warning: number; info: number;
        totals: { expected: number; received: number };
      };
    },
    onSuccess: (res) => {
      toast.success(t("integrity.runComplete"));
      qc.invalidateQueries({ queryKey: ["integrity-issues"] });
      qc.invalidateQueries({ queryKey: ["integrity-snapshots"] });
    },
    onError: (e: any) => {
      toast.error(e?.message || t("integrity.runFailed"));
    },
  });
}
