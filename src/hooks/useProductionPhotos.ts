import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";
import { toast } from "sonner";
import { withAbortableTimeout, withPromiseTimeout } from "@/lib/asyncGuard";
import { uploadFile, deleteFiles, getFileUrl } from "@/lib/storage";

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
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
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
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    img.src = objectUrl;
  });
}

export function useProductionPhotos(orderId: string | null) {
  const qc = useQueryClient();
  const { workspaceId } = useWorkspace();

  const query = useQuery({
    queryKey: ["production_photos", orderId],
    enabled: !!orderId,
    retry: 0,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? [],
    queryFn: async () => {
      const { data, error } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) => ((supabase as any)
          .from("production_photos")
          .select("*")
          .eq("production_order_id", orderId)
          .order("created_at", { ascending: false }) as any).abortSignal(signal),
        10000,
        "production_photos_list",
      );
      if (error) throw error;
      // Generate signed URLs
      const list = (data ?? []) as ProductionPhoto[];
      for (const p of list) {
        p.signed_url = getFileUrl("production-photos", p.storage_path);
      }
      return list;
    },
  });

  const upload = useMutation({
    mutationFn: async ({ file, category, caption }: { file: File; category: PhotoCategory; caption?: string }) => {
      if (!orderId || !workspaceId) throw new Error("Ordem inválida");
      const blob = file.type.startsWith("image/") ? await compress(file) : file;
      const ext = "jpg";
      const path = `${workspaceId}/${orderId}/${Date.now()}_${category}.${ext}`;
      await withPromiseTimeout<any>(
        uploadFile("production-photos", path, blob, "image/jpeg"),
        10000,
        "production_photos_upload",
      );
      const { error: insErr } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) => ((supabase as any).from("production_photos").insert({
          production_order_id: orderId, workspace_id: workspaceId, category, storage_path: path,
          caption: caption ?? null, size_bytes: (blob as Blob).size,
        }) as any).abortSignal(signal),
        10000,
        "production_photos_insert",
      );
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_photos", orderId] });
      qc.invalidateQueries({ queryKey: ["production_events", orderId] });
      toast.success("Foto enviada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (photo: ProductionPhoto) => {
      await withPromiseTimeout<any>(
        deleteFiles("production-photos", [photo.storage_path]),
        10000,
        "production_photos_remove_storage",
      );
      const { error } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) => ((supabase as any).from("production_photos").delete().eq("id", photo.id) as any).abortSignal(signal),
        10000,
        "production_photos_remove_row",
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production_photos", orderId] }),
    onError: (e: any) => toast.error(e.message),
  });

  return { ...query, upload, remove };
}
