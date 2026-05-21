/**
 * Phase 5 — Platform Security Dashboard (owner only).
 *
 * Renders a KPI strip + recent security events feed sourced from
 * `security_events` and `compute_security_metrics()`. Read-only.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, KeyRound, Activity, Globe2, AlertTriangle } from "lucide-react";
import { LoadingState } from "@/components/shared/LoadingState";

type Metrics = {
  logins_24h?: number;
  failed_24h?: number;
  critical_7d?: number;
  suspicious_7d?: number;
  active_sessions?: number;
  distinct_ips_24h?: number;
  error?: string;
};

interface SecurityEvent {
  id: string;
  event_type: string;
  severity: "info" | "warn" | "critical";
  ip_address: string | null;
  user_agent: string | null;
  resource: string | null;
  resource_id: string | null;
  metadata: any;
  risk_score: number;
  created_at: string;
  user_id: string | null;
  workspace_id: string | null;
}

const TONE: Record<string, string> = {
  info: "bg-muted/40 text-foreground border-border/50",
  warn: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
};

function KPI({ icon: Icon, label, value, tone = "primary" }: any) {
  return (
    <Card className="surface-card p-4 flex items-center gap-3">
      <div className={`rounded-md p-2 bg-${tone}/10 text-${tone}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value ?? "—"}</div>
      </div>
    </Card>
  );
}

export function SecurityDashboard() {
  const { data: metrics, isLoading: mLoad } = useQuery({
    queryKey: ["security-metrics"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<Metrics> => {
      const { data, error } = await supabase.rpc("compute_security_metrics" as any);
      if (error) throw error;
      return (data as Metrics) ?? {};
    },
  });

  const { data: events = [], isLoading: eLoad } = useQuery({
    queryKey: ["security-events-feed"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_events" as any)
        .select("id,event_type,severity,ip_address,user_agent,resource,resource_id,metadata,risk_score,created_at,user_id,workspace_id")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return ((data || []) as unknown) as SecurityEvent[];
    },
  });

  if (mLoad || eLoad) return <LoadingState variant="cards" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI icon={ShieldCheck}  label="Logins 24h"      value={metrics?.logins_24h} />
        <KPI icon={KeyRound}     label="Falhas 24h"      value={metrics?.failed_24h} tone="amber-500" />
        <KPI icon={ShieldAlert}  label="Críticos 7d"     value={metrics?.critical_7d} tone="red-500" />
        <KPI icon={AlertTriangle}label="Suspeitos 7d"    value={metrics?.suspicious_7d} tone="red-500" />
        <KPI icon={Activity}     label="Sessões ativas"  value={metrics?.active_sessions} />
        <KPI icon={Globe2}       label="IPs distintos 24h" value={metrics?.distinct_ips_24h} />
      </div>

      <Card className="surface-card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <div className="text-sm font-medium">Atividade recente</div>
          <Badge variant="outline" className="text-[10px]">append-only</Badge>
        </div>
        <div className="divide-y divide-border/40 max-h-[520px] overflow-y-auto">
          {events.length === 0 && (
            <div className="px-4 py-8 text-sm text-muted-foreground text-center">
              Sem eventos registados.
            </div>
          )}
          {events.map((ev) => (
            <div key={ev.id} className="px-4 py-3 flex items-start gap-3 text-sm">
              <span className={`shrink-0 text-[10px] uppercase tracking-wide border rounded px-1.5 py-0.5 ${TONE[ev.severity] ?? TONE.info}`}>
                {ev.severity}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{ev.event_type}</span>
                  {ev.resource && (
                    <span className="text-xs text-muted-foreground">/ {ev.resource}{ev.resource_id ? `:${ev.resource_id.slice(0,8)}` : ""}</span>
                  )}
                  {ev.risk_score > 0 && (
                    <Badge variant="outline" className="text-[10px]">risk {ev.risk_score}</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {ev.ip_address ?? "ip n/a"} · {ev.metadata?.device ?? "device n/a"} · {ev.metadata?.href ?? ""}
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                {new Date(ev.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
