import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { RealtimeHub } from "@/lib/realtime/RealtimeHub";
import { RuntimeHealthMonitor } from "@/lib/observability";
import { AlertTriangle, Bell, Bot, Radio, Workflow, GitMerge } from "lucide-react";

type EvtKind = "alert" | "recommendation" | "automation" | "discrepancy" | "ingest" | "backend";

interface OpEvent {
  id: string;
  kind: EvtKind;
  title: string;
  detail?: string;
  ts: string;
}

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
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
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
      const [alerts, recs, autos, discs, hails, logs] = await Promise.all([
        supabase.from("ai_alerts").select("id, title, message, created_at, severity")
          .eq("workspace_id", workspaceId!).order("created_at", { ascending: false }).limit(15),
        supabase.from("ai_recommendations").select("id, title, rationale, created_at")
          .eq("workspace_id", workspaceId!).order("created_at", { ascending: false }).limit(10),
        supabase.from("automation_executions").select("id, status, created_at, automation_id")
          .order("created_at", { ascending: false }).limit(10),
        supabase.from("discrepancies").select("id, kind, created_at").order("created_at", { ascending: false }).limit(10),
        supabase.from("hail_events").select("id, locality, severity, occurred_at")
          .order("occurred_at", { ascending: false }).limit(5),
        supabase.from("backend_event_logs").select("id, event_type, payload, created_at")
          .order("created_at", { ascending: false }).limit(15),
      ]);

      const merged: OpEvent[] = [
        ...(alerts.data ?? []).map((r: any) => ({
          id: `a-${r.id}`, kind: "alert" as EvtKind, title: r.title ?? "Alerta", detail: r.message ?? "", ts: r.created_at,
        })),
        ...(recs.data ?? []).map((r: any) => ({
          id: `r-${r.id}`, kind: "recommendation" as EvtKind, title: r.title ?? "Recomendação IA", detail: r.rationale ?? "", ts: r.created_at,
        })),
        ...(autos.data ?? []).map((r: any) => ({
          id: `auto-${r.id}`, kind: "automation" as EvtKind, title: `Automação ${r.status}`, ts: r.created_at,
        })),
        ...(discs.data ?? []).map((r: any) => ({
          id: `d-${r.id}`, kind: "discrepancy" as EvtKind, title: `Discrepância ${r.kind ?? ""}`, ts: r.created_at,
        })),
        ...(hails.data ?? []).map((r: any) => ({
          id: `h-${r.id}`, kind: "ingest" as EvtKind, title: `Granizo ${r.severity ?? ""}`, detail: r.locality ?? "", ts: r.occurred_at,
        })),
        ...(logs.data ?? []).map((r: any) => ({
          id: `l-${r.id}`, kind: "backend" as EvtKind, title: r.event_type ?? "Evento", ts: r.created_at,
        })),
        // Live runtime telemetry — edge failures captured in-memory by the monitor
        ...RuntimeHealthMonitor.getSnapshot().edgeFailures.slice(0, 10).map((f) => ({
          id: `ef-${f.fn}-${f.at}`,
          kind: "backend" as EvtKind,
          title: `Edge ${f.fn} falhou`,
          detail: f.message,
          ts: new Date(f.at).toISOString(),
        })),
      ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 30);

      if (!cancelled) {
        setEvents(merged);
        setLoading(false);
      }
    }

    load();
    const offs = [
      RealtimeHub.subscribe({ table: "ai_alerts", event: "INSERT", workspaceId }, load),
      RealtimeHub.subscribe({ table: "ai_recommendations", event: "INSERT", workspaceId }, load),
      RealtimeHub.subscribe({ table: "automation_executions", event: "INSERT", workspaceId }, load),
      RealtimeHub.subscribe({ table: "discrepancies", event: "INSERT", workspaceId }, load),
      RealtimeHub.subscribe({ table: "hail_events", event: "INSERT" }, load),
      RuntimeHealthMonitor.subscribe(() => load()),
    ];
    return () => { cancelled = true; offs.forEach((off) => off()); };
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
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground/80 border border-border/60 rounded px-1.5 py-0.5">
          {events.length}
        </span>
      </div>

      <div className="max-h-96 overflow-y-auto space-y-0.5 -mx-1 px-1">
        {loading ? (
          <div className="space-y-1.5 py-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 px-2 animate-pulse">
                <div className="h-3 w-3 rounded-full bg-muted/50" />
                <div className="h-3 flex-1 rounded bg-muted/30" />
                <div className="h-3 w-8 rounded bg-muted/30" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Radio className="h-5 w-5 mx-auto text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">Sem eventos operacionais recentes.</p>
            <p className="text-[10px] text-muted-foreground/60">O stream actualiza automaticamente.</p>
          </div>
        ) : (
          events.map((e) => {
            const meta = KIND_META[e.kind];
            const Icon = meta.icon;
            return (
              <div
                key={e.id}
                className="flex items-start gap-2.5 py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors border-l border-transparent hover:border-l-primary/40"
              >
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
