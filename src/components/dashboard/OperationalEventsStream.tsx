import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { RuntimeHealthMonitor } from "@/lib/observability";
import { AlertTriangle, Bell, Bot, Radio, Workflow, GitMerge } from "lucide-react";

type EvtKind = "alert" | "recommendation" | "automation" | "discrepancy" | "ingest" | "backend";
interface OpEvent { id: string; kind: EvtKind; title: string; detail?: string; ts: string; }

const KIND_META: Record<EvtKind, { icon: any; cls: string; label: string }> = {
  alert: { icon: AlertTriangle, cls: "text-rose-400", label: "ALERTA" },
  recommendation: { icon: Bot, cls: "text-violet-400", label: "IA" },
  automation: { icon: Workflow, cls: "text-sky-400", label: "AUTOMAÇÃO" },
  discrepancy: { icon: GitMerge, cls: "text-amber-400", label: "DISCREPÂNCIA" },
  ingest: { icon: Radio, cls: "text-emerald-400", label: "INGEST" },
  backend: { icon: Bell, cls: "text-muted-foreground", label: "EVENTO" },
};

function timeAgo(ts: string): string {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "agora"; if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function OperationalEventsStream() {
  const { workspaceId } = useWorkspace();
  const [events, setEvents] = useState<OpEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    async function load() {
      try {
        const [hailData, logsData] = await Promise.all([
          apiRequest<{ hailEvents: any[] }>("/weather/hail-events?limit=5").catch(() => ({ hailEvents: [] })),
          apiRequest<{ events: any[] }>("/weather/backend-events?limit=15").catch(() => ({ events: [] })),
        ]);
        const merged: OpEvent[] = [
          ...(hailData.hailEvents ?? []).map((r: any) => ({
            id: `h-${r.id}`, kind: "ingest" as EvtKind,
            title: `Granizo ${r.severity ?? ""}`, detail: r.city ?? "",
            ts: r.observed_time ?? r.forecast_time ?? r.created_at,
          })),
          ...(logsData.events ?? []).map((r: any) => ({
            id: `l-${r.id}`, kind: "backend" as EvtKind, title: r.action ?? "Evento", ts: r.created_at,
          })),
          ...RuntimeHealthMonitor.getSnapshot().edgeFailures.slice(0, 10).map((f: any) => ({
            id: `ef-${f.fn}-${f.at}`, kind: "backend" as EvtKind,
            title: `Edge ${f.fn} falhou`, detail: f.message, ts: new Date(f.at).toISOString(),
          })),
        ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 30);
        if (!cancelled) { setEvents(merged); setLoading(false); }
      } catch { if (!cancelled) setLoading(false); }
    }

    load();
    const interval = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [workspaceId]);

  return (
    <section className="glass-panel rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
              <span className="relative rounded-full bg-emerald-400 h-2 w-2" />
            </span>
            Stream operacional
          </h2>
          <p className="text-[11px] text-muted-foreground">Eventos em tempo real do workspace</p>
        </div>
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground/80 border border-border/60 rounded px-1.5 py-0.5">{events.length}</span>
      </div>
      <div className="max-h-96 overflow-y-auto space-y-0.5 -mx-1 px-1">
        {loading ? (
          <div className="space-y-1.5 py-1">{[0,1,2,3].map(i => (<div key={i} className="flex items-center gap-2 py-1.5 px-2 animate-pulse"><div className="h-3 w-3 rounded-full bg-muted/50"/><div className="h-3 flex-1 rounded bg-muted/30"/><div className="h-3 w-8 rounded bg-muted/30"/></div>))}</div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Radio className="h-5 w-5 mx-auto text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">Sem eventos operacionais recentes.</p>
            <p className="text-[10px] text-muted-foreground/60">O stream actualiza automaticamente.</p>
          </div>
        ) : (
          events.map(e => {
            const meta = KIND_META[e.kind]; const Icon = meta.icon;
            return (
              <div key={e.id} className="flex items-start gap-2.5 py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors border-l border-transparent hover:border-l-primary/40">
                <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${meta.cls}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-bold uppercase tracking-[0.1em] ${meta.cls}`}>{meta.label}</span>
                    <span className="text-xs font-medium truncate">{e.title}</span>
                  </div>
                  {e.detail && <p className="text-[11px] text-muted-foreground truncate">{e.detail}</p>}
                </div>
                <span className="text-[10px] text-muted-foreground/80 tabular-nums shrink-0 mt-0.5">{timeAgo(e.ts)}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
