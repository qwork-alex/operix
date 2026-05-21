/**
 * Phase 5.5 — Owner-only compliance & risk overview.
 * Pure presentational dashboard built on RPCs from useCompliance.
 */
import { ShieldCheck, FileCheck2, Trash2, AlertTriangle, ScrollText, Smartphone, Activity, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/shared/LoadingState";
import {
  useComplianceOverview,
  useFraudSignals,
  useImmutableAuditLogs,
  useWorkspaceDeletions,
} from "@/hooks/useCompliance";

const SEV_TONES: Record<string, string> = {
  info: "bg-muted text-muted-foreground",
  low: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-500 border border-amber-500/30",
  high: "bg-orange-500/10 text-orange-500 border border-orange-500/30",
  critical: "bg-red-500/10 text-red-500 border border-red-500/30",
};

export function ComplianceDashboard() {
  const { data: overview, isLoading } = useComplianceOverview();
  const { data: signals = [] } = useFraudSignals(25);
  const { data: audit = [] } = useImmutableAuditLogs(25);
  const { data: deletions = [] } = useWorkspaceDeletions();

  if (isLoading) return <LoadingState variant="cards" />;
  const o = (overview ?? {}) as any;

  const kpis = [
    { label: "Consentimentos (total)", value: o.consents_total ?? 0, icon: FileCheck2, tone: "text-primary" },
    { label: "Consentimentos 30d", value: o.consents_30d ?? 0, icon: ShieldCheck, tone: "text-emerald-500" },
    { label: "Exportações abertas", value: o.export_requests_open ?? 0, icon: Download, tone: "text-amber-500" },
    { label: "Deleções agendadas", value: o.deletion_requests_pending ?? 0, icon: Trash2, tone: "text-orange-500" },
    { label: "Sinais críticos", value: o.fraud_open_critical ?? 0, icon: AlertTriangle, tone: "text-red-500" },
    { label: "Sinais abertos", value: o.fraud_open_total ?? 0, icon: AlertTriangle, tone: "text-amber-500" },
    { label: "Dispositivos activos", value: o.active_devices ?? 0, icon: Smartphone, tone: "text-primary" },
    { label: "Logs imutáveis 24h", value: o.audit_logs_24h ?? 0, icon: ScrollText, tone: "text-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4 surface-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <k.icon className={`h-3.5 w-3.5 ${k.tone}`} /> {k.label}
            </div>
            <p className="text-2xl font-semibold">{k.value}</p>
          </Card>
        ))}
      </div>

      <Card className="surface-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold">Sinais anti-fraude recentes</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">{signals.length}</Badge>
        </div>
        {signals.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">Nenhum sinal nas últimas 30 dias.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Tipo</th>
                  <th className="text-left px-4 py-2">Severidade</th>
                  <th className="text-left px-4 py-2">Risk</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">IP / Country</th>
                  <th className="text-left px-4 py-2">Quando</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s: any) => (
                  <tr key={s.id} className="border-t border-border/30 hover:bg-muted/20">
                    <td className="px-4 py-2 font-mono text-xs">{s.signal_type}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-[10px] ${SEV_TONES[s.severity] || ""}`}>{s.severity}</span></td>
                    <td className="px-4 py-2 font-semibold">{s.risk_score}</td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{s.status}</Badge></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{s.ip_address ?? "—"} {s.country ? `· ${s.country}` : ""}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="surface-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-semibold">Pedidos de exclusão de workspace</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">{deletions.length}</Badge>
        </div>
        {deletions.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">Sem pedidos de exclusão.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Workspace</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Retém até</th>
                  <th className="text-left px-4 py-2">Razão</th>
                </tr>
              </thead>
              <tbody>
                {deletions.map((d: any) => (
                  <tr key={d.id} className="border-t border-border/30">
                    <td className="px-4 py-2 font-mono text-xs">{d.workspace_id?.slice(0, 8)}…</td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{d.status}</Badge></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{d.retention_until ? new Date(d.retention_until).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-xs">{d.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="surface-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Trilha imutável (últimos eventos)</h3>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-border/30">
          {audit.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Sem registos.</div>
          ) : audit.map((e: any) => (
            <div key={e.id} className="px-4 py-2.5 flex items-start gap-3 text-xs">
              <Badge variant="outline" className="text-[10px]">{e.category}</Badge>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{e.action}{e.resource ? ` · ${e.resource}` : ""}</div>
                <div className="text-muted-foreground text-[10px]">hash {e.row_hash?.slice(0, 14) ?? "—"}… · {new Date(e.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
