import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TERMS_VERSION } from "@/config/legal";

/**
 * Returns whether the current user has accepted the current legal terms version.
 * Backed by public.user_consents. Cached in TanStack Query.
 */
export function useConsent() {
  const { user, loading: authLoading } = useAuth();

  const query = useQuery({
    queryKey: ["user-consent", user?.id, TERMS_VERSION],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_consents" as any)
        .select("id, status, created_at")
        .eq("user_id", user!.id)
        .eq("terms_version", TERMS_VERSION)
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[useConsent] error:", error);
        return null;
      }
      return data;
    },
  });

  return {
    hasConsented: !!query.data,
    isLoading: authLoading || query.isLoading,
    refetch: query.refetch,
  };
}
