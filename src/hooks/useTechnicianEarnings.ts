import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface TechEarningsMap {
  [technicianName: string]: number; // percentage
}

/**
 * Fetches technician percentages from profit_rules + profit_rule_items.
 * Supports both group-based and legacy technician-based rules.
 * Looks for the "technician" type item in the active rule.
 */
export function useTechnicianEarnings() {
  return useQuery({
    queryKey: ["technician_earnings_map"],
    queryFn: async () => {
      // Get all active rules with their items
      const { data: rules, error } = await supabase
        .from("profit_rules")
        .select("technician_id, group_id, is_active, profit_rule_items(percentage, participant_type)")
        .eq("is_active", true);

      if (error) throw error;

      // Get technician names
      const { data: technicians } = await supabase
        .from("technicians")
        .select("id, name");

      const techMap = new Map((technicians || []).map(t => [t.id, t.name]));

      const map: TechEarningsMap = {};
      for (const rule of rules || []) {
        // Legacy: technician-based rules
        if (rule.technician_id) {
          const techName = techMap.get(rule.technician_id);
          if (!techName) continue;
          const items = (rule as any).profit_rule_items || [];
          const techItem = items.find((i: any) => i.participant_type === "technician");
          if (techItem) {
            map[techName.toLowerCase()] = Number(techItem.percentage) || 0;
          }
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
