import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { BrandConfig } from "@/components/layout/BrandNameEditor";

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
    // Non-blocking branding: never throws, never retries, 4s timeout.
    // Auth / dashboard MUST work even if company_settings is unreachable.
    queryFn: async () => {
      const empty = { brandConfig: {} as BrandConfig };
      try {
        const data = await apiRequest<{ settings: any }>("/settings/company");
        return { brandConfig: (data?.settings?.brand_config as BrandConfig | null) || {} };
      } catch {
        return empty;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const brandMutation = useMutation({
    mutationFn: async (brandConfig: BrandConfig) => {
      await apiRequest("/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_config: brandConfig }),
      });
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
