import { Activity, AlertTriangle, Bell, Radio, Users, Building2 } from "lucide-react";
import { useOperationalKpis } from "@/hooks/useOperationalKpis";

interface CellProps {
  label: string;
  value: string | number;
  icon: any;
  tone: string;
  pulse?: boolean;
  sub?: string;
}

function KpiCell({ label, value, icon: Icon, tone, pulse, sub }: CellProps) {
  return (
    <div className="glass-panel rounded-xl p-4 space-y-2 relative overflow-hidden">
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={`relative flex h-8 w-8 items-center justify-center rounded-lg bg-muted ${tone}`}>
          <Icon className="h-4 w-4" />
          {pulse && (
            <span className="absolute inset-0 rounded-lg border border-current animate-ping opacity-30" />
          )}
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums text-foreground">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function OperationalKPIs() {
  const { data, isLoading } = useOperationalKpis();
  const v = (n?: number) => (isLoading ? "—" : String(n ?? 0));
  const degraded = data?.platformsDegraded ?? 0;
  const alerts = data?.alerts ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiCell label="Plataformas Ativas" value={v(data?.platformsActive)}
        icon={Activity} tone="text-emerald-400" pulse={(data?.platformsActive ?? 0) > 0} />
      <KpiCell label="Degradadas" value={v(degraded)}
        icon={AlertTriangle} tone={degraded > 0 ? "text-rose-400" : "text-muted-foreground"}
        pulse={degraded > 0} />
      <KpiCell label="Alertas" value={v(alerts)}
        icon={Bell} tone={alerts > 0 ? "text-amber-400" : "text-muted-foreground"}
        pulse={alerts > 0} />
      <KpiCell label="Eventos 24h" value={v(data?.realtimeEvents24h)}
        icon={Radio} tone="text-sky-400" sub="backend stream" />
      <KpiCell label="Técnicos Ativos" value={v(data?.activeTechnicians)}
        icon={Users} tone="text-violet-400" sub="em operação" />
      <KpiCell label="Clientes Ativos" value={v(data?.activeClients)}
        icon={Building2} tone="text-amber-300" sub="com OS abertas" />
    </div>
  );
}
