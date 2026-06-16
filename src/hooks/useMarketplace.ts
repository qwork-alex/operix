import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useWorkspace } from "./useWorkspace";
import { toast } from "sonner";
import { withPromiseTimeout } from "@/lib/asyncGuard";
import { uploadFile, deleteFiles, getFileUrl } from "@/lib/storage";

export type MarketplaceCategory =
  | "vehicles" | "parts" | "services" | "tools" | "equipment" | "other";
export type MarketplaceCondition = "new" | "like_new" | "good" | "fair" | "for_parts";
export type MarketplaceVisibility = "public" | "private" | "workspace" | "clients" | "team";
export type MarketplaceStatus = "draft" | "active" | "sold" | "archived";

export interface MarketplaceListing {
  id: string;
  workspace_id: string | null;
  created_by: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string;
  category: MarketplaceCategory;
  condition: MarketplaceCondition | null;
  location: string | null;
  manufacturer: string | null;
  model: string | null;
  year: number | null;
  visibility: MarketplaceVisibility;
  status: MarketplaceStatus;
  cover_photo_path: string | null;
  view_count: number;
  favorite_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketplacePhoto {
  id: string;
  listing_id: string;
  storage_path: string;
  order_index: number;
  created_at: string;
}

export const CATEGORY_META: Record<MarketplaceCategory, { label: string }> = {
  vehicles: { label: "Veículos" },
  parts: { label: "Peças" },
  services: { label: "Serviços" },
  tools: { label: "Ferramentas" },
  equipment: { label: "Equipamentos" },
  other: { label: "Outros" },
};

export const CONDITION_META: Record<MarketplaceCondition, { label: string }> = {
  new: { label: "Novo" },
  like_new: { label: "Como novo" },
  good: { label: "Bom" },
  fair: { label: "Razoável" },
  for_parts: { label: "Para peças" },
};

export const VISIBILITY_META: Record<MarketplaceVisibility, { label: string }> = {
  public: { label: "Público" },
  workspace: { label: "Apenas workspace" },
  team: { label: "Apenas equipe" },
  clients: { label: "Apenas clientes" },
  private: { label: "Privado" },
};

export const STATUS_META: Record<MarketplaceStatus, { label: string; tone: string }> = {
  draft: { label: "Rascunho", tone: "text-muted-foreground" },
  active: { label: "Ativo", tone: "text-emerald-500" },
  sold: { label: "Vendido", tone: "text-blue-500" },
  archived: { label: "Arquivado", tone: "text-amber-500" },
};

export function getPublicPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return getFileUrl("marketplace", path);
}

interface ListingFilters {
  category?: MarketplaceCategory | "all";
  search?: string;
  scope?: "all" | "mine";
}

export function useMarketplaceListings(filters: ListingFilters = {}) {
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();

  return useQuery({
    queryKey: ["marketplace_listings", workspaceId, filters],
    enabled: !!user?.id,
    retry: 0,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData ?? [],
    queryFn: async () => {
      let q: any = supabase
        .from("marketplace_listings" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (filters.scope === "mine") {
        q = q.eq("created_by", user!.id);
      } else {
        q = q.eq("status", "active");
      }
      if (filters.category && filters.category !== "all") q = q.eq("category", filters.category);
      if (filters.search && filters.search.trim()) {
        const s = filters.search.trim().replace(/[%_]/g, "");
        q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%,manufacturer.ilike.%${s}%,model.ilike.%${s}%`);
      }
      const { data, error } = await withPromiseTimeout<any>(q, 10000, "marketplace_listings");
      if (error) throw error;
      return (data ?? []) as MarketplaceListing[];
    },
  });
}

export function useMarketplaceListing(id: string | null | undefined) {
  return useQuery({
    queryKey: ["marketplace_listing", id],
    enabled: !!id,
    retry: 0,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData ?? null,
    queryFn: async () => {
      const { data, error } = await withPromiseTimeout<any>((supabase as any)
        .from("marketplace_listings")
        .select("*")
        .eq("id", id!)
        .maybeSingle(), 10000, "marketplace_listing");
      if (error) throw error;
      return data as MarketplaceListing | null;
    },
  });
}

export function useMarketplacePhotos(listingId: string | null | undefined) {
  return useQuery({
    queryKey: ["marketplace_photos", listingId],
    enabled: !!listingId,
    retry: 0,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData ?? [],
    queryFn: async () => {
      const { data, error } = await withPromiseTimeout<any>((supabase as any)
        .from("marketplace_listing_photos")
        .select("*")
        .eq("listing_id", listingId!)
        .order("order_index", { ascending: true }), 10000, "marketplace_photos");
      if (error) throw error;
      return (data ?? []) as MarketplacePhoto[];
    },
  });
}

export function useMarketplaceMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();

  const upsertListing = useMutation({
    mutationFn: async (payload: Partial<MarketplaceListing> & { id?: string }) => {
      if (!user?.id) throw new Error("Não autenticado");
      const { id, ...rest } = payload;
      // Strip server-managed fields
      const clean: any = { ...rest };
      delete clean.created_at;
      delete clean.updated_at;
      delete clean.view_count;
      delete clean.favorite_count;

      if (id) {
        const { data, error } = await (supabase as any)
          .from("marketplace_listings")
          .update(clean)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data as MarketplaceListing;
      } else {
        const insertPayload = {
          status: "draft" as MarketplaceStatus,
          visibility: "workspace" as MarketplaceVisibility,
          category: "other" as MarketplaceCategory,
          currency: "EUR",
          ...clean,
          created_by: user.id,
          workspace_id: workspaceId ?? null,
        };
        const { data, error } = await (supabase as any)
          .from("marketplace_listings")
          .insert(insertPayload)
          .select()
          .single();
        if (error) throw error;
        return data as MarketplaceListing;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace_listings"] });
      qc.invalidateQueries({ queryKey: ["marketplace_listing"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar anúncio"),
  });

  const deleteListing = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("marketplace_listings")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace_listings"] });
      toast.success("Anúncio removido");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  const uploadPhoto = useMutation({
    mutationFn: async ({ listingId, file, orderIndex }: { listingId: string; file: File; orderIndex: number }) => {
      if (!user?.id) throw new Error("Não autenticado");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${listingId}/${crypto.randomUUID()}.${ext}`;
      await uploadFile("marketplace", path, file, file.type);

      const { data, error } = await (supabase as any)
        .from("marketplace_listing_photos")
        .insert({ listing_id: listingId, storage_path: path, order_index: orderIndex, uploaded_by: user.id })
        .select()
        .single();
      if (error) throw error;

      // Set cover if first photo
      if (orderIndex === 0) {
        await (supabase as any)
          .from("marketplace_listings")
          .update({ cover_photo_path: path })
          .eq("id", listingId)
          .is("cover_photo_path", null);
      }
      return data as MarketplacePhoto;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["marketplace_photos", vars.listingId] });
      qc.invalidateQueries({ queryKey: ["marketplace_listings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro no upload"),
  });

  const deletePhoto = useMutation({
    mutationFn: async (photo: MarketplacePhoto) => {
      await deleteFiles("marketplace", [photo.storage_path]);
      const { error } = await (supabase as any)
        .from("marketplace_listing_photos")
        .delete()
        .eq("id", photo.id);
      if (error) throw error;
    },
    onSuccess: (_, photo) => {
      qc.invalidateQueries({ queryKey: ["marketplace_photos", photo.listing_id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover foto"),
  });

  return { upsertListing, deleteListing, uploadPhoto, deletePhoto };
}
