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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";

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
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["workspace-stripe-sync", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceStripeLink> => {
      const { data, error } = await supabase
        .from("workspace_subscriptions")
        .select(
          "stripe_subscription_id, stripe_customer_id, stripe_price_lookup_key, stripe_environment, last_recalculated_at",
        )
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return {
          state: "unavailable",
          stripe_subscription_id: null,
          stripe_customer_id: null,
          stripe_price_lookup_key: null,
          stripe_environment: null,
          last_recalculated_at: null,
        };
      }

      const state: StripeSyncState = data.stripe_subscription_id
        ? "synced"
        : data.stripe_customer_id
          ? "customer_only"
          : "pending";

      return {
        state,
        stripe_subscription_id: data.stripe_subscription_id,
        stripe_customer_id: data.stripe_customer_id,
        stripe_price_lookup_key: data.stripe_price_lookup_key,
        stripe_environment: data.stripe_environment,
        last_recalculated_at: data.last_recalculated_at,
      };
    },
  });
}
