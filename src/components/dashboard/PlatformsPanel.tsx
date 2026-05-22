import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePlatforms, type Platform, type PlatformState } from "@/hooks/usePlatforms";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Activity, PauseCircle, Archive, AlertTriangle, Play, Radio,
  RotateCcw, FileDown, Eye, EyeOff,
} from "lucide-react";

const STATE_META: Record<PlatformState, { label: string; cls: string; icon: any; dot: string }> = {
  active:   { label: "Activa",     cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: Activity,       dot: "bg-emerald-400" },
  paused:   { label: "Inactiva",   cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",       icon: PauseCircle,    dot: "bg-amber-400" },
  archived: { label: "Arquivada",  cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",          icon: Archive,        dot: "bg-zinc-500" },
  degraded: { label: "Degradada",  cls: "bg-rose-500/15 text-rose-400 border-rose-500/30",          icon: AlertTriangle,  dot: "bg-rose-400" },
};

function timeAgo(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

interface Counts { so: number; soOpen: number; soDone: number; }

function usePlatformCounts(workspaceId: string | null) {
  return useQuery({
    queryKey: ["platforms", "counts", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<Record<string, Counts>> => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("platform_id,status")
        .eq("workspace_id", workspaceId!)
        .not("platform_id", "is", null);
      if (error) throw error;
      const out: Record<string, Counts> = {};
      for (const r of data ?? []) {
        const id = (r as any).platform_id as string;
        const st = String((r as any).status ?? "");
        const c = (out[id] ||= { so: 0, soOpen: 0, soDone: 0 });
        c.so += 1;
        if (["paid", "completed", "done", "fechada", "paga"].includes(st)) c.soDone += 1;
        else c.soOpen += 1;
      }
      return out;
    },
    staleTime: 30_000,
  });
}

async function exportPlatformReport(p: Platform, workspaceId: string) {
  const { data, error } = await supabase
    .from("service_orders")
    .select("id,client_name,status,created_at,year_reference,total_value")
    .eq("workspace_id", workspaceId)
    .eq("platform_id", p.id)
    .order("created_at", { ascending: false });
  if (error) {
    toast({ title: "Erro a gerar relatório", description: error.message, variant: "destructive" });
    return;
  }
  const rows = data ?? [];
  const header = ["id", "client_name", "status", "created_at", "year_reference", "total_value"];
  const csv = [
    `# Relatório operacional — ${p.name}`,
    `# Estado: ${p.state} · OS: ${rows.length} · Gerado: ${new Date().toISOString()}`,
    header.join(","),
    ...rows.map((r: any) =>
      header.map((k) => {
        const v = r[k] ?? "";
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      }).join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `plataforma_${p.slug}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast({ title: "Relatório gerado", description: `${rows.length} OS exportadas` });
}

function PlatformCard({ p, counts, workspaceId }: { p: Platform; counts?: Counts; workspaceId: string }) {
  const { setState } = usePlatforms();
  const meta = STATE_META[p.state];
  const Icon = meta.icon;
  const isPulsing = p.state === "active";

  const change = (state: PlatformState) => setState.mutate({ id: p.id, state });

  return (
    <div className="glass-panel rounded-xl p-4 space-y-3 transition-all hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`relative h-2.5 w-2.5 rounded-full ${meta.dot}`}>
            {isPulsing && <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />}
          </div>
          <h3 className="font-semibold truncate">{p.name}</h3>
        </div>
        <Badge variant="outline" className={`${meta.cls} text-[10px] uppercase tracking-wider gap-1`}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Radio className="h-3 w-3" />
        Heartbeat: {timeAgo(p.last_heartbeat_at)} · Ingest: {timeAgo(p.last_ingest_at)}
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5">
          OS <span className="font-semibold text-foreground">{counts?.so ?? 0}</span>
        </span>
        <span className="rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400 px-2 py-0.5">
          Abertas {counts?.soOpen ?? 0}
        </span>
        <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-2 py-0.5">
          Concluídas {counts?.soDone ?? 0}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {p.state !== "active" && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => change("active")}>
            <Play className="h-3 w-3" /> Activar
          </Button>
        )}
        {p.state === "active" && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => change("paused")}>
            <PauseCircle className="h-3 w-3" /> Desactivar
          </Button>
        )}
        {p.state !== "archived" ? (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => change("archived")}>
            <Archive className="h-3 w-3" /> Arquivar
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => change("paused")}>
            <RotateCcw className="h-3 w-3" /> Restaurar
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1 text-muted-foreground ml-auto"
          onClick={() => exportPlatformReport(p, workspaceId)}
        >
          <FileDown className="h-3 w-3" /> Relatório
        </Button>
      </div>
    </div>
  );
}

export function PlatformsPanel() {
  const { platforms, isLoading } = usePlatforms();
  const { workspaceId } = useWorkspace();
  const { data: counts } = usePlatformCounts(workspaceId);
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(
    () => platforms.filter((p) => (showArchived ? true : p.state !== "archived")),
    [platforms, showArchived],
  );

  const summary = useMemo(() => {
    const s = { active: 0, paused: 0, archived: 0, degraded: 0 };
    for (const p of platforms) s[p.state] += 1;
    return s;
  }, [platforms]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Plataformas operacionais</h2>
          <p className="text-xs text-muted-foreground">
            Geradas automaticamente pelas Ordens de Serviço · sincronizadas com OP, Financeiro e Relatórios
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-2 py-0.5">
            Activas {summary.active}
          </span>
          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400 px-2 py-0.5">
            Inactivas {summary.paused}
          </span>
          <span className="rounded-md border border-zinc-500/30 bg-zinc-500/10 text-zinc-400 px-2 py-0.5">
            Arquivadas {summary.archived}
          </span>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showArchived ? "Ocultar arquivadas" : "Ver arquivadas"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass-panel rounded-xl p-4 space-y-3 animate-pulse">
              <div className="h-4 w-1/2 rounded bg-muted/50" />
              <div className="h-3 w-3/4 rounded bg-muted/30" />
              <div className="h-7 w-24 rounded bg-muted/30" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 text-center space-y-2">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
            <Activity className="h-4 w-4" />
          </div>
          <p className="text-sm font-medium">Nenhuma plataforma activa</p>
          <p className="text-xs text-muted-foreground">
            As plataformas aparecem aqui automaticamente quando Ordens de Serviço são criadas.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((p) => (
            <PlatformCard key={p.id} p={p} counts={counts?.[p.id]} workspaceId={workspaceId!} />
          ))}
        </div>
      )}
    </section>
  );
}
