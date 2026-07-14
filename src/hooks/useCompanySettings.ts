import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
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
    // Non-blocking: never throws, returns null on error/timeout.
    queryFn: async () => {
      try {
        const data = await apiRequest<{ settings: any }>("/settings/company");
        return data?.settings ?? null;
      } catch {
        return null;
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (settings: Record<string, unknown>) => {
      await apiRequest("/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      toast.success("Company settings saved");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return { settings: query.data, isLoading: query.isLoading, saveMutation };
}
