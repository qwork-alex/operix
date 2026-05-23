import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface UserProfile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  avatar_url: string | null;
  display_code: string | null;
}

export function useUserProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["user-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<UserProfile | null> => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, address, avatar_url, display_code")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as UserProfile) ?? null;
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<Omit<UserProfile, "id" | "email">>) => {
      if (!user?.id) throw new Error("Not authenticated");
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-profile"] });
      qc.invalidateQueries({ queryKey: ["all-profiles"] });
      toast.success("Perfil atualizado");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return { profile: query.data ?? null, isLoading: query.isLoading, save };
}
