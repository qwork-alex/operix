import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "@/hooks/use-toast";

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
    retry: 0,
    staleTime: 30_000,
    queryFn: () =>
      apiRequest<Platform[]>(`/platforms?workspace_id=${encodeURIComponent(workspaceId!)}`, {
        timeoutMs: 10000,
      }),
  });

  const setState = useMutation({
    mutationFn: async ({ id, state }: { id: string; state: PlatformState }) => {
      await apiRequest<Platform>(`/platforms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
        timeoutMs: 10000,
      });
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
      qc.invalidateQueries({ queryKey: [...QK, workspaceId] });
      toast({ title: "Estado actualizado" });
    },
  });

  const create = useMutation({
    mutationFn: async ({ name, slug, state = "active" as PlatformState }: { name: string; slug?: string; state?: PlatformState }) => {
      if (!workspaceId) throw new Error("Sem workspace activo");
      return apiRequest<Platform>("/platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId, name: name.trim(), slug, state }),
        timeoutMs: 10000,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...QK, workspaceId] });
    },
    onError: (err) =>
      toast({ title: "Erro ao criar", description: String((err as any)?.message ?? err), variant: "destructive" }),
  });

  return { ...query, platforms: query.data ?? [], setState, create };
}
