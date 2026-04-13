import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface TechEarningsMap {
  [technicianName: string]: number; // percentage
}

/**
 * Fetches technician percentages from profit_distributions.
 * Notes format: groupId::groupName::userName::userType
 * We look for userType === "technician" and use tech_share as their %.
 */
export function useTechnicianEarnings() {
  return useQuery({
    queryKey: ["technician_earnings_map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profit_distributions")
        .select("notes, tech_share")
        .eq("scope", "rule");
      if (error) throw error;

      const map: TechEarningsMap = {};
      for (const row of data || []) {
        if (!row.notes) continue;
        const parts = row.notes.split("::");
        // format: groupId::groupName::userName::userType
        if (parts.length >= 4) {
          const userName = parts[2];
          const userType = parts[3];
          if (userType === "technician" && userName) {
            map[userName.toLowerCase()] = Number(row.tech_share) || 0;
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
