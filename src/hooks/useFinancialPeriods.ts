import { useQuery } from "@tanstack/react-query";
import { listFinancialRecords, listFinanceTechnicians } from "@/lib/apiFinance";
import { useWorkspace } from "@/hooks/useWorkspace";

/**
 * Phase 5C — Temporal Source of Truth.
 *
 * Returns the union of years actually used by the Financial module
 * inside the current workspace. Combines:
 *   - `year_reference` values stored on `financial_records`
 *   - the current year (always available so new periods can be created)
 *
 * All downstream modules (Accounting, Participation, Integrity) MUST
 * use this hook instead of inventing standalone year lists.
 */
export function useFinancialYears(techId?: string | null) {
  const { workspaceId } = useWorkspace();
  const tech = techId || null;

  return useQuery({
    queryKey: ["financial-years", workspaceId, tech],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async (): Promise<number[]> => {
      const data = await listFinancialRecords({
        workspace_id: workspaceId!,
        assigned_user_id: tech ?? undefined,
      });

      const set = new Set<number>();
      (data || []).forEach((r: any) => {
        const y = Number(r.year_reference);
        if (y && y > 1900 && y < 3000) set.add(y);
      });
      // When a specific technician is selected, scope strictly to their years.
      // Otherwise include the current year so new periods can always be created.
      if (!tech) set.add(new Date().getFullYear());
      return Array.from(set).sort((a, b) => a - b);
    },
  });
}

/**
 * Returns the technicians available in the current workspace, derived
 * exclusively from `user_roles` (role = technician). No manual insertion.
 */
export function useWorkspaceTechnicians() {
  return useQuery({
    queryKey: ["workspace-technicians"],
    staleTime: 30_000,
    retry: 0,
    queryFn: () => listFinanceTechnicians(),
  });
}

export const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];
