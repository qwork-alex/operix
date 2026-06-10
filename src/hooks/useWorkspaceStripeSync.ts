/**
 * Reads the Stripe linkage fields off the current workspace subscription
 * and resolves them into a single, UI-friendly sync state so the billing
 * page can show an honest synchronization indicator.
 *
 *   "synced"        — stripe_subscription_id present (live link)
 *   "customer_only" — only stripe_customer_id present (checkout started, no sub)
 *   "pending"       — workspace row exists but no Stripe ids yet
 *   "unavailable"   — no workspace row / not loaded
 */
import { useWorkspaceBillingContext } from "./useWorkspaceBillingContext";

export type StripeSyncState = "synced" | "customer_only" | "pending" | "unavailable";

export interface WorkspaceStripeLink {
  state: StripeSyncState;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  stripe_price_lookup_key: string | null;
  stripe_environment: string | null;
  last_recalculated_at: string | null;
}

export function useWorkspaceStripeSync() {
  const billingContext = useWorkspaceBillingContext();

  return {
    ...billingContext,
    data: billingContext.data?.stripe ?? {
      state: "unavailable" as StripeSyncState,
      stripe_subscription_id: null,
      stripe_customer_id: null,
      stripe_price_lookup_key: null,
      stripe_environment: null,
      last_recalculated_at: null,
    },
  };
}
