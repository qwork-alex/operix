import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Aggregates Accounting expense records (financial_records) by period (Mon/YY)
 * and by category bucket. Manual entries (source = 'manual_financial') are
 * EXCLUDED — they belong to the editable "Manual" column inside the Financial
 * spreadsheet and must remain independent.
 *
 * Returned shape:
 *   { [periodKey: "Mon/YY"]: { [bucketKey]: number } }
 *
 * Bucket keys (must match ACCOUNTING_COLUMNS in ExpenseSpreadsheet):
 *   acc_gov | acc_purchases | acc_fuel | acc_expenses | acc_withdrawals | acc_rentals
 */

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export type AccountingBucketKey =
  | "acc_gov"
  | "acc_purchases"
  | "acc_fuel"
  | "acc_expenses"
  | "acc_withdrawals"
  | "acc_rentals";

export interface AccountingColumnDef {
  id: AccountingBucketKey;
  label: string;
  color: string; // HSL string without hsl()
}

export const ACCOUNTING_COLUMNS: AccountingColumnDef[] = [
  { id: "acc_gov",         label: "Governo",     color: "152 60% 45%" },
  { id: "acc_purchases",   label: "Compras",     color: "280 60% 60%" },
  { id: "acc_fuel",        label: "Combustível", color: "210 80% 55%" },
  { id: "acc_expenses",    label: "Despesas",    color: "0 72% 55%"  },
  { id: "acc_withdrawals", label: "Retiradas",   color: "28 92% 55%"  },
  { id: "acc_rentals",     label: "Aluguéis",    color: "43 85% 55%"  },
];

function categoryToBucket(category: string | null | undefined): AccountingBucketKey | null {
  switch (category) {
    case "tax":      return "acc_gov";
    case "material": return "acc_purchases";
    case "fuel":     return "acc_fuel";
    case "salary":   return "acc_withdrawals";
    case "rent":     return "acc_rentals";
    case "other":    return "acc_expenses";
    default:         return null;
  }
}

function dateToPeriodKey(d: Date): string {
  const m = MONTH_LABELS[d.getMonth()];
  const y = String(d.getFullYear()).slice(2);
  return `${m}/${y}`;
}

export type AccountingPeriodMap = Record<string, Partial<Record<AccountingBucketKey, number>>>;

export function useAccountingExpensesByPeriod() {
  return useQuery({
    queryKey: ["accounting-expenses-by-period"],
    queryFn: async (): Promise<AccountingPeriodMap> => {
      const { data, error } = await supabase
        .from("financial_records")
        .select("amount, category, source, type, created_at")
        .eq("type", "expense");
      if (error) throw error;

      const map: AccountingPeriodMap = {};
      for (const r of data || []) {
        // Skip manual entries — they live in the Manual column
        if ((r as any).source === "manual_financial") continue;
        const bucket = categoryToBucket((r as any).category);
        if (!bucket) continue;
        const period = dateToPeriodKey(new Date((r as any).created_at));
        if (!map[period]) map[period] = {};
        map[period]![bucket] = (map[period]![bucket] || 0) + Number((r as any).amount || 0);
      }
      return map;
    },
  });
}
