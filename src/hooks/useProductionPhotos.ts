import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";
import { toast } from "sonner";

export type PhotoCategory = "before" | "during" | "after" | "damage" | "validation";

export interface ProductionPhoto {
  id: string;
  production_order_id: string;
  workspace_id: string;
  uploaded_by: string;
  category: PhotoCategory;
  storage_path: string;
  caption: string | null;
  created_at: string;
  signed_url?: string;
}

export const PHOTO_CATEGORIES: { value: PhotoCategory; label: string }[] = [
  { value: "before", label: "Antes" },
  { value: "during", label: "Durante" },
  { value: "after", label: "Depois" },
  { value: "damage", label: "Danos" },
  { value: "validation", label: "Validação" },
];

async function compress(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas error"));
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Blob error")), "image/jpeg", quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function useProductionPhotos(orderId: string | null) {
  const qc = useQueryClient();
  const { workspaceId } = useWorkspace();

  const query = useQuery({
    queryKey: ["production_photos", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("production_photos")
        .select("*")
        .eq("production_order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Generate signed URLs
      const list = (data ?? []) as ProductionPhoto[];
      await Promise.all(list.map(async (p) => {
        const { data: s } = await supabase.storage.from("production-photos").createSignedUrl(p.storage_path, 3600);
        p.signed_url = s?.signedUrl;
      }));
      return list;
    },
  });

  const upload = useMutation({
    mutationFn: async ({ file, category, caption }: { file: File; category: PhotoCategory; caption?: string }) => {
      if (!orderId || !workspaceId) throw new Error("Ordem inválida");
      const blob = file.type.startsWith("image/") ? await compress(file) : file;
      const ext = "jpg";
      const path = `${workspaceId}/${orderId}/${Date.now()}_${category}.${ext}`;
      const { error: upErr } = await supabase.storage.from("production-photos").upload(path, blob, {
        contentType: "image/jpeg", upsert: false,
      });
      if (upErr) throw upErr;
      const { error: insErr } = await (supabase as any).from("production_photos").insert({
        production_order_id: orderId, workspace_id: workspaceId, category, storage_path: path,
        caption: caption ?? null, size_bytes: (blob as Blob).size,
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_photos", orderId] });
      toast.success("Foto enviada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (photo: ProductionPhoto) => {
      await supabase.storage.from("production-photos").remove([photo.storage_path]);
      const { error } = await (supabase as any).from("production_photos").delete().eq("id", photo.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production_photos", orderId] }),
    onError: (e: any) => toast.error(e.message),
  });

  return { ...query, upload, remove };
}
