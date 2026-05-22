import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "@/hooks/use-toast";
import { RealtimeHub } from "@/lib/realtime/RealtimeHub";

export type PlatformState = "active" | "paused" | "archived" | "degraded";

export interface Platform {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  state: PlatformState;
  color: string | null;
  metadata: Record<string, any>;
  last_heartbeat_at: string | null;
  last_ingest_at: string | null;
  created_at: string;
  updated_at: string;
}

const QK = ["platforms"] as const;

export function usePlatforms() {
  const qc = useQueryClient();
  const { workspaceId } = useWorkspace();

  const query = useQuery({
    queryKey: [...QK, workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<Platform[]> => {
      const { data, error } = await supabase
        .from("platforms")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Platform[];
    },
  });

  // Realtime subscription (shared via RealtimeHub)
  useEffect(() => {
    if (!workspaceId) return;
    const off = RealtimeHub.subscribe(
      { table: "platforms", workspaceId },
      () => qc.invalidateQueries({ queryKey: [...QK, workspaceId] }),
    );
    return off;
  }, [workspaceId, qc]);

  const setState = useMutation({
    mutationFn: async ({ id, state }: { id: string; state: PlatformState }) => {
      const { error } = await supabase.from("platforms").update({ state }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, state }) => {
      await qc.cancelQueries({ queryKey: [...QK, workspaceId] });
      const prev = qc.getQueryData<Platform[]>([...QK, workspaceId]);
      qc.setQueryData<Platform[]>([...QK, workspaceId], (old) =>
        (old ?? []).map((p) => (p.id === id ? { ...p, state } : p))
      );
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData([...QK, workspaceId], ctx.prev);
      toast({ title: "Erro", description: String((err as any)?.message ?? err), variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Estado actualizado" });
    },
  });

  const create = useMutation({
    mutationFn: async ({ name, slug }: { name: string; slug?: string }) => {
      if (!workspaceId) throw new Error("Sem workspace activo");
      const finalSlug = (slug ?? name).toLowerCase().trim().replace(/\s+/g, "-");
      const { error } = await supabase
        .from("platforms")
        .insert({ workspace_id: workspaceId, name: name.trim(), slug: finalSlug });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...QK, workspaceId] });
      toast({ title: "Plataforma criada" });
    },
    onError: (err) =>
      toast({ title: "Erro ao criar", description: String((err as any)?.message ?? err), variant: "destructive" }),
  });

  return { ...query, platforms: query.data ?? [], setState, create };
}
