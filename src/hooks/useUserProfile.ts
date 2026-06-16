import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
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
    retry: 0,
    staleTime: 5 * 60_000,
    placeholderData: (previousData) => previousData ?? null,
    queryFn: async (): Promise<UserProfile | null> => {
      if (!user?.id) return null;
      const data = await apiRequest<{ profile: UserProfile | null }>("/account/profile", { timeoutMs: 8000 });
      return data.profile ?? null;
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<Omit<UserProfile, "id" | "email">>) => {
      if (!user?.id) throw new Error("Not authenticated");
      await apiRequest("/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });
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
