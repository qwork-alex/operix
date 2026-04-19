import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Aggregates expenses from financial_records by category, mirroring the
 * Accounting Control Center modules. Manual entries (source = 'manual_financial')
 * are kept SEPARATE so the Financial page can show them in a distinct bucket.
 *
 * Categories (must stay in sync with src/components/accounting/useAccountingModules.ts):
 *   rent     → Aluguéis
 *   fuel     → Combustível
 *   material → Compras
 *   tax      → Governo
 *   salary   → Retiradas
 *   other    → Despesas (genéricas da contabilidade)
 *
 * Manual entries created directly in the Financial page must use
 *   source = 'manual_financial'
 * so they are excluded from the accounting buckets.
 */

export type ExpenseCategoryKey =
  | "rentals"
  | "expenses"
  | "fuel"
  | "purchases"
  | "government"
  | "withdrawals"
  | "manual";

export interface ExpenseCategoryBucket {
  key: ExpenseCategoryKey;
  label: string;
  color: string; // HSL string without hsl()
  total: number;
  count: number;
}

const CATEGORY_DEFS: Array<{
  key: ExpenseCategoryKey;
  label: string;
  color: string;
  match: (r: any) => boolean;
}> = [
  {
    key: "rentals",
    label: "Aluguéis",
    color: "43 85% 55%",
    match: (r) => r.category === "rent" && r.source !== "manual_financial",
  },
  {
    key: "fuel",
    label: "Combustível",
    color: "210 80% 55%",
    match: (r) => r.category === "fuel" && r.source !== "manual_financial",
  },
  {
    key: "purchases",
    label: "Compras",
    color: "280 60% 60%",
    match: (r) => r.category === "material" && r.source !== "manual_financial",
  },
  {
    key: "government",
    label: "Governo",
    color: "152 60% 45%",
    match: (r) => r.category === "tax" && r.source !== "manual_financial",
  },
  {
    key: "withdrawals",
    label: "Retiradas",
    color: "28 92% 55%",
    match: (r) => r.category === "salary" && r.source !== "manual_financial",
  },
  {
    key: "expenses",
    label: "Despesas",
    color: "0 72% 55%",
    match: (r) =>
      r.source !== "manual_financial" &&
      (!r.category ||
        !["rent", "fuel", "material", "tax", "salary"].includes(r.category)),
  },
  {
    key: "manual",
    label: "Manual",
    color: "220 10% 65%",
    match: (r) => r.source === "manual_financial",
  },
];

export function useExpensesByCategory() {
  return useQuery({
    queryKey: ["expenses-by-category"],
    queryFn: async (): Promise<{
      buckets: ExpenseCategoryBucket[];
      total: number;
    }> => {
      const { data, error } = await supabase
        .from("financial_records")
        .select("amount, category, source, type");
      if (error) throw error;

      const expenses = (data || []).filter((r: any) => r.type === "expense");

      const buckets = CATEGORY_DEFS.map((def) => {
        const matched = expenses.filter(def.match);
        const total = matched.reduce(
          (s: number, r: any) => s + Number(r.amount || 0),
          0
        );
        return {
          key: def.key,
          label: def.label,
          color: def.color,
          total,
          count: matched.length,
        };
      });

      const total = buckets.reduce((s, b) => s + b.total, 0);
      return { buckets, total };
    },
  });
}
