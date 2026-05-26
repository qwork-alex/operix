import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TERMS_VERSION } from "@/config/legal";

/**
 * Returns whether the current user has accepted the current legal terms version.
 * Backed by public.user_consents. Cached in TanStack Query.
 *
 * Hardened with a hard timeout so a slow/unhealthy backend NEVER blocks app boot.
 * On timeout or error we resolve as "consented" (bypass the gate) to keep the
 * core app usable — the gate is a soft compliance UI, not a security boundary.
 */
export function useConsent() {
  const { user, loading: authLoading } = useAuth();

  const query = useQuery({
    queryKey: ["user-consent", user?.id, TERMS_VERSION],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      const fetchConsent = async () => {
        const { data, error } = await supabase
          .from("user_consents" as any)
          .select("id, status, created_at")
          .eq("user_id", user!.id)
          .eq("terms_version", TERMS_VERSION)
          .eq("status", "accepted")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data;
      };

      // Hard 4s timeout — if the DB is slow we bypass the gate instead of
      // hanging the entire app on "Verificando consentimentos…".
      const timeout = new Promise<{ __bypass: true }>((resolve) =>
        setTimeout(() => resolve({ __bypass: true }), 4000),
      );

      try {
        const result: any = await Promise.race([fetchConsent(), timeout]);
        if (result && result.__bypass) {
          console.warn("[useConsent] timeout — bypassing consent gate");
          return { __bypass: true } as any;
        }
        return result;
      } catch (err) {
        console.error("[useConsent] error — bypassing consent gate:", err);
        return { __bypass: true } as any;
      }
    },
  });

  return {
    hasConsented: !!query.data,
    isLoading: !!user?.id && (authLoading || query.isLoading),
    refetch: query.refetch,
  };
}
