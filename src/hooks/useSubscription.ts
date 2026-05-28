import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";
import { useAuth } from "./useAuth";

export type SubscriptionStatus =
  | "trial" | "active" | "grace_period" | "overdue" | "suspended" | "cancelled";

export interface SubscriptionSnapshot {
  exists: boolean;
  subscription?: {
    id: string;
    workspace_id: string;
    plan_id: string;
    status: SubscriptionStatus;
    billing_cycle: "monthly" | "yearly";
    trial_started_at: string;
    trial_ends_at: string;
    current_period_start: string | null;
    current_period_end: string | null;
    grace_until: string | null;
    cancelled_at: string | null;
    technician_count: number;
    current_price: number;
  };
  plan?: {
    code: string;
    name: string;
    base_price_monthly: number;
    base_tech_included: number;
    extra_block_size: number;
    extra_block_price: number;
    yearly_discount_months: number;
  };
  usage?: { technician_count: number; included: number; next_tier_at: number };
  pricing?: { current_monthly: number; current_yearly: number; next_tier_price: number };
  trial?: { is_trial: boolean; days_left: number; ends_at: string };
}

export function useSubscription() {
  const { workspaceId } = useWorkspace();

  return useQuery({
    queryKey: ["workspace-subscription", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<SubscriptionSnapshot | null> => {
      const { data, error } = await supabase.rpc("get_workspace_subscription", {
        _workspace_id: workspaceId!,
      });
      if (error) {
        console.error("[useSubscription]", error);
        return null;
      }
      return data as unknown as SubscriptionSnapshot;
    },
  });
}

/**
 * Platform-owner detection — OWNER GLOBAL identity layer.
 *
 * The OWNER is the master of the platform itself; it is NOT a workspace
 * and must never be replaced by tenant hydration. Detection runs
 * synchronously off the authenticated email — no DB round-trip, no
 * extra provider, no parallel hydration — so the owner identity stays
 * stable across reconnects, GoTrue degradation and workspace remounts.
 */
const PLATFORM_OWNER_EMAILS = ["qwork@qworkgroup.com"];

export function useIsPlatformOwner() {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() ?? null;
  const isOwner = !!email && PLATFORM_OWNER_EMAILS.includes(email);
  return useQuery({
    queryKey: ["is-platform-owner", email],
    staleTime: Infinity,
    enabled: !!email,
    initialData: isOwner,
    queryFn: async () => isOwner,
  });
}
