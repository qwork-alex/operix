import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface TechEarningsMap {
  [technicianName: string]: number; // percentage
}

/**
 * Fetches technician percentages from profit_rules + profit_rule_items.
 * Rules use group_ids[] and assigned_user_id (auth.users.id) to link.
 * Looks for the "technician" type item in the active rule.
 * Names are resolved via the profiles table.
 */
export function useTechnicianEarnings() {
  return useQuery({
    queryKey: ["technician_earnings_map"],
    queryFn: async () => {
      // Get all active rules with their items
      const { data: rules, error } = await supabase
        .from("profit_rules")
        .select("assigned_user_id, group_ids, is_active, profit_rule_items(percentage, participant_type)")
        .eq("is_active", true);

      if (error) throw error;

      // Resolve names from profiles for any assigned_user_id present
      const userIds = Array.from(
        new Set((rules || []).map((r: any) => r.assigned_user_id).filter(Boolean))
      ) as string[];

      let nameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        nameMap = new Map((profiles || []).map((p) => [p.id, p.full_name || ""]));
      }

      const map: TechEarningsMap = {};
      for (const rule of rules || []) {
        const userId = (rule as any).assigned_user_id;
        if (!userId) continue;
        const techName = nameMap.get(userId);
        if (!techName) continue;
        const items = (rule as any).profit_rule_items || [];
        const techItem = items.find((i: any) => i.participant_type === "technician");
        if (techItem) {
          map[techName.toLowerCase()] = Number(techItem.percentage) || 0;
        }
      }
      return map;
    },
    staleTime: 60_000,
  });
}

export function getTechEarnings(
  techName: string | null | undefined,
  total: number | null | undefined,
  earningsMap: TechEarningsMap | undefined
): { percentage: number; earnings: number } | null {
  if (!techName || !earningsMap || total == null) return null;
  const pct = earningsMap[techName.toLowerCase()];
  if (pct == null) return null;
  return { percentage: pct, earnings: Math.round((total * pct) / 100 * 100) / 100 };
}
