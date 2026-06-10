/**
 * Billing abstraction layer.
 *
 * Two completely independent billing subjects:
 *   - workspace_subscription   (paid by the workspace admin/owner)
 *   - technician_subscription  (paid by the individual technician)
 *
 * UI must always route through this module — never read `subscription_plans`
 * or `*_subscriptions` directly. This keeps Stripe/RPC details out of components
 * and gives us one place to swap providers later.
 */
import { apiRequest } from "@/lib/api";

export type PlanKind = "workspace" | "technician";
export type BillingCycle = "monthly" | "yearly";

export interface WorkspaceTier {
  code: string;            // e.g. "workspace_t1"
  name: string;
  base_price_monthly: number;
  yearly_price: number;    // 10-month equivalent today
  tier_min: number | null;
  tier_max: number | null;
  sort_order: number;
}

export const TECHNICIAN_PRO_PRICE = 24.99;
export const TECHNICIAN_PRO_LOOKUP_KEY = {
  monthly: "technician_pro_monthly",
  yearly:  "technician_pro_yearly",
} as const;

/** Format a price with the neutral VAT suffix used across the platform. */
export function formatPriceWithVAT(value: number, cycle: BillingCycle = "monthly"): string {
  const unit = cycle === "monthly" ? "/mês" : "/ano";
  return `${value.toFixed(2).replace(".", ",")}€ + IVA aplicável${unit ? ` ${unit}` : ""}`;
}

/** Pick the tier whose [tier_min, tier_max] covers `techCount`. */
export function resolveTier(tiers: WorkspaceTier[], techCount: number): WorkspaceTier | null {
  if (!tiers.length) return null;
  const sorted = [...tiers].sort((a, b) => a.sort_order - b.sort_order);
  const match = sorted.find((t) =>
    techCount >= (t.tier_min ?? 1) && techCount <= (t.tier_max ?? Number.MAX_SAFE_INTEGER)
  );
  return match ?? sorted[sorted.length - 1];
}

export function buildLookupKey(planCode: string, cycle: BillingCycle): string {
  return `${planCode}_${cycle}`;
}

/** List the active workspace tiers (server-validated). */
export async function fetchWorkspaceTiers(): Promise<WorkspaceTier[]> {
  try {
    const data = await apiRequest<{ tiers: WorkspaceTier[] }>("/billing/workspace-tiers");
    return data.tiers ?? [];
  } catch (error) {
    console.error("[billing] fetchWorkspaceTiers", error);
    return [];
  }
}
