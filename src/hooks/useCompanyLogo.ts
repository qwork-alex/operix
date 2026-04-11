import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BrandConfig } from "@/components/layout/BrandNameEditor";

export function useCompanyLogo() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["company-brand"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("logo_url, brand_config")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return {
        logoUrl: data?.logo_url || "",
        brandConfig: (data?.brand_config as BrandConfig | null) || {},
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop() || "png";
      const path = `company-logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      const { data: existing } = await supabase
        .from("company_settings")
        .select("id, user_id")
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("company_settings")
          .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const { error } = await supabase
          .from("company_settings")
          .insert({ logo_url: publicUrl, user_id: user.id });
        if (error) throw error;
      }

      return publicUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-brand"] });
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
  });

  const brandMutation = useMutation({
    mutationFn: async (brandConfig: BrandConfig) => {
      const { data: existing } = await supabase
        .from("company_settings")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("company_settings")
          .update({ brand_config: brandConfig as any, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const { error } = await supabase
          .from("company_settings")
          .insert({ brand_config: brandConfig as any, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-brand"] });
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
  });

  return {
    logoUrl: data?.logoUrl || "",
    brandConfig: data?.brandConfig || {},
    isLoading,
    uploadLogo: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    saveBrandConfig: brandMutation.mutateAsync,
    isSavingBrand: brandMutation.isPending,
  };
}
