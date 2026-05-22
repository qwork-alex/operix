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
    ];
    return () => { cancelled = true; offs.forEach((off) => off()); };
  }, [workspaceId]);

  return (
    <section className="glass-panel rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
            Stream operacional
          </h2>
          <p className="text-xs text-muted-foreground">Eventos em tempo real do workspace</p>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">{events.length} evento(s)</span>
      </div>

      <div className="max-h-96 overflow-y-auto space-y-1.5 -mx-1 px-1">
        {loading ? (
          <div className="text-sm text-muted-foreground">A carregar…</div>
        ) : events.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            Sem eventos operacionais recentes.
          </div>
        ) : (
          events.map((e) => {
            const meta = KIND_META[e.kind];
            const Icon = meta.icon;
            return (
              <div key={e.id} className="flex items-start gap-2.5 py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors">
                <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${meta.cls}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${meta.cls}`}>{meta.label}</span>
                    <span className="text-xs font-medium truncate">{e.title}</span>
                  </div>
                  {e.detail && <p className="text-[11px] text-muted-foreground truncate">{e.detail}</p>}
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{timeAgo(e.ts)}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
