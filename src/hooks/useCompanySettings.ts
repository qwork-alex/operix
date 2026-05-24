import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { getCurrentUserId, logSaveError, logSavePayload } from "@/lib/authUser";
import { toast } from "sonner";

export interface CompanySettings {
  company_name: string;
  siret: string;
  tva_number: string;
  address: string;
  logo_url: string;
}

export function useCompanySettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["company-settings", user?.id],
    enabled: !!user,
    // Non-blocking: never throws, returns null on error/timeout.
    queryFn: async () => {
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("settings_timeout")), 4000)
        );
        const fetchP = supabase
          .from("company_settings")
          .select("*")
          .eq("user_id", user?.id ?? "")
          .maybeSingle();
        const { data, error } = (await Promise.race([fetchP, timeout])) as any;
        if (error) return null;
        return data;
      } catch {
        return null;
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });


  const saveMutation = useMutation({
    mutationFn: async (settings: CompanySettings) => {
      const currentUserId = await getCurrentUserId();

      const { data: existing } = await supabase
        .from("company_settings")
        .select("id")
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (existing) {
        const payload = { ...settings, updated_at: new Date().toISOString() };
        logSavePayload("CompanySettings:update", currentUserId, payload);
        const { error } = await (supabase as any)
          .from("company_settings")
          .update(payload)
          .eq("user_id", currentUserId);
        if (error) {
          logSaveError("CompanySettings:update", error);
          throw error;
        }
      } else {
        const payload = { ...settings };
        logSavePayload("CompanySettings:insert", currentUserId, payload);
        const { error } = await (supabase as any)
          .from("company_settings")
          .insert(payload);
        if (error) {
          logSaveError("CompanySettings:insert", error);
          throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      toast.success("Company settings saved");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return { settings: query.data, isLoading: query.isLoading, saveMutation };
}
