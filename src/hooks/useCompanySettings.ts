import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
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
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings" as any)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as (CompanySettings & { id: string; user_id: string }) | null;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (settings: CompanySettings) => {
      if (!user) throw new Error("Not authenticated");

      // Try update first, then insert
      const { data: existing } = await supabase
        .from("company_settings" as any)
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("company_settings" as any)
          .update({ ...settings, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_settings" as any)
          .insert({ ...settings, user_id: user.id });
        if (error) throw error;
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
