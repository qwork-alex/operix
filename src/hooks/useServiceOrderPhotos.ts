import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withAbortableTimeout, withPromiseTimeout } from "@/lib/asyncGuard";
import { uploadFile, deleteFiles, getFileUrl } from "@/lib/storage";

export type ServiceOrderPhotoCategory = "before" | "during" | "after";

export type ServiceOrderPhoto = {
  id: string;
  name: string;
  display_name: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  visual_state: any;
  signed_url?: string | null;
};

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-()]+/g, "_");
}

export function useServiceOrderPhotos(serviceOrderId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["service-order-photos", serviceOrderId],
    enabled: !!serviceOrderId,
    retry: 0,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? [],
    queryFn: async () => {
      const { data, error } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) => ((supabase as any)
          .from("documents")
          .select("id, name, display_name, storage_path, mime_type, size_bytes, created_at, visual_state")
          .eq("module", "service_order_photos")
          .eq("service_order_id", serviceOrderId!)
          .order("created_at", { ascending: false }) as any).abortSignal(signal),
        10000,
        "service_order_photos_list",
      );
      if (error) throw error;

      const rows = (data ?? []) as ServiceOrderPhoto[];
      return rows.map((p) => ({
        ...p,
        signed_url: p.storage_path ? getFileUrl("uploads", p.storage_path) : null,
      }));
    },
  });

  const upload = useMutation({
    mutationFn: async ({ file, category }: { file: File; category: ServiceOrderPhotoCategory }) => {
      if (!serviceOrderId) throw new Error("Ordem de serviço inválida");
      if (!file || file.size === 0) throw new Error("Ficheiro inválido");
      if (!file.type.startsWith("image/")) throw new Error("Envie apenas imagens para as fotos da OS.");

      const safeName = sanitizeFileName(file.name || "photo.jpg");
      const storagePath = `service-order-photos/${serviceOrderId}/${category}/${Date.now()}_${safeName}`;

      await withPromiseTimeout<any>(
        uploadFile("uploads", storagePath, file, file.type),
        10000,
        "service_order_photos_upload",
      );

      const insertPayload: Record<string, any> = {
        name: safeName,
        display_name: safeName,
        type: "file",
        module: "service_order_photos",
        entity_type: "service_order",
        entity_id: serviceOrderId,
        service_order_id: serviceOrderId,
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
        rotation: 0,
        zoom: 1,
        validated: true,
        visual_state: { category, updatedAt: new Date().toISOString() },
      };

      const { data, error } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) => ((supabase as any)
          .from("documents")
          .insert(insertPayload)
          .select("id")
          .single() as any).abortSignal(signal),
        10000,
        "service_order_photos_insert",
      );
      if (error) throw new Error(error.message);
      return { id: (data as any).id as string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-order-photos", serviceOrderId] }),
  });

  const remove = useMutation({
    mutationFn: async (photo: ServiceOrderPhoto) => {
      if (!photo?.id) throw new Error("Foto inválida");
      if (photo.storage_path) {
        await withPromiseTimeout<any>(
          deleteFiles("uploads", [photo.storage_path]),
          10000,
          "service_order_photos_remove_storage",
        );
      }
      const { error } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) => ((supabase as any).from("documents").delete().eq("id", photo.id) as any).abortSignal(signal),
        10000,
        "service_order_photos_remove_row",
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-order-photos", serviceOrderId] }),
  });

  return { ...query, upload, remove };
}

