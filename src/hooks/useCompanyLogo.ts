import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCompanyLogo() {
  const queryClient = useQueryClient();

  const { data: logoUrl, isLoading } = useQuery({
    queryKey: ["company-logo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("logo_url")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.logo_url || "";
    },
    staleTime: 5 * 60 * 1000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop() || "png";
      const path = `company-logo-${Date.now()}.${ext}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      // Update company_settings - get first record
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
        // Need a user_id - get current user
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
      queryClient.invalidateQueries({ queryKey: ["company-logo"] });
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
  });

  return {
    logoUrl: logoUrl || "",
    isLoading,
    uploadLogo: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
  };
}
