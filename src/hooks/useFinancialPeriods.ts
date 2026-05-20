import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
export function useFinancialYears() {
  const { workspaceId } = useWorkspace();

  return useQuery({
    queryKey: ["financial-years", workspaceId],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async (): Promise<number[]> => {
      const { data, error } = await supabase
        .from("financial_records")
        .select("year_reference")
        .eq("workspace_id", workspaceId!)
        .not("year_reference", "is", null);
      if (error) throw error;

      const set = new Set<number>();
      (data || []).forEach((r: any) => {
        const y = Number(r.year_reference);
        if (y && y > 1900 && y < 3000) set.add(y);
      });
      set.add(new Date().getFullYear());
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
    queryFn: async () => {
      const { data: roleRows, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "technician");
      if (rErr) throw rErr;
      const ids = (roleRows || []).map((r: any) => r.user_id).filter(Boolean);
      if (ids.length === 0) return [] as { id: string; name: string }[];

      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      if (pErr) throw pErr;
      return (profiles || [])
        .map((p: any) => ({ id: p.id, name: p.full_name || p.email || "—" }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

export const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];
