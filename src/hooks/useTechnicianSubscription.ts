/**
 * Per-user technician subscription hook.
 * Backed by RPC `get_technician_subscription(_user_id)`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface TechnicianSubscriptionSnapshot {
  exists: boolean;
  subscription?: {
    id: string;
    user_id: string;
    status: string;
    billing_cycle: "monthly" | "yearly";
    current_period_end: string | null;
    trial_ends_at: string | null;
    stripe_subscription_id: string | null;
    current_price: number;
  };
  plan?: {
    code: string;
    name: string;
    base_price_monthly: number;
  };
}

export function useTechnicianSubscription() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["technician-subscription", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<TechnicianSubscriptionSnapshot | null> => {
      const { data, error } = await supabase.rpc("get_technician_subscription" as any, {
        _user_id: user!.id,
      } as any);
      if (error) {
        console.error("[useTechnicianSubscription]", error);
        return null;
      }
      return (data as unknown as TechnicianSubscriptionSnapshot) ?? { exists: false };
    },
  });
}
