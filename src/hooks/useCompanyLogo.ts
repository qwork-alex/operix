import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BrandConfig } from "@/components/layout/BrandNameEditor";
import { getCurrentUserId, logSaveError, logSavePayload } from "@/lib/authUser";

/**
 * Procedural branding store.
 *
 * The platform uses LETTER-BASED procedural branding only — there is no
 * raster logo upload. This hook persists the editable brand_config
 * (name, color, font, glow, etc.) used by <BrandLogo /> and the sidebar.
 */
export function useCompanyLogo() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["company-brand"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("brand_config")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return {
        brandConfig: (data?.brand_config as BrandConfig | null) || {},
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const brandMutation = useMutation({
    mutationFn: async (brandConfig: BrandConfig) => {
      const currentUserId = await getCurrentUserId();
      const { data: existing } = await supabase
        .from("company_settings")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (existing) {
        const payload = { brand_config: brandConfig as any, updated_at: new Date().toISOString() };
        logSavePayload("CompanyBrand:update", currentUserId, payload);
        const { error } = await (supabase as any)
          .from("company_settings")
          .update(payload)
          .eq("id", existing.id);
        if (error) {
          logSaveError("CompanyBrand:update", error);
          throw error;
        }
      } else {
        const payload = { brand_config: brandConfig as any };
        logSavePayload("CompanyBrand:insert", currentUserId, payload);
        const { error } = await (supabase as any)
          .from("company_settings")
          .insert(payload);
        if (error) {
          logSaveError("CompanyBrand:insert", error);
          throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-brand"] });
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
  });

  return {
    brandConfig: data?.brandConfig || {},
    isLoading,
    saveBrandConfig: brandMutation.mutateAsync,
    isSavingBrand: brandMutation.isPending,
  };
}
