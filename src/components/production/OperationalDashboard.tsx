import { Card } from "@/components/ui/card";
import { useProductionKpis } from "@/hooks/useProductionOrders";
import { Activity, AlertTriangle, CheckCircle2, Clock, PauseCircle, TrendingUp, Truck, Users } from "lucide-react";

export function OperationalDashboard() {
  const { data: k, isLoading } = useProductionKpis();
  if (isLoading || !k) return <div className="text-center py-8 text-muted-foreground">Carregando KPIs…</div>;

  const cards = [
    { label: "Em Produção", value: k.in_progress, icon: Activity, tone: "text-indigo-500" },
    { label: "Pausados", value: k.paused, icon: PauseCircle, tone: "text-orange-500" },
    { label: "Finalizados Hoje", value: k.finished_today, icon: CheckCircle2, tone: "text-emerald-500" },
    { label: "Entregues Hoje", value: k.delivered_today, icon: Truck, tone: "text-green-600" },
    { label: "Atrasados", value: k.overdue, icon: AlertTriangle, tone: "text-destructive" },
    { label: "Técnicos Ativos", value: k.active_technicians, icon: Users, tone: "text-blue-500" },
    { label: "Tempo Médio (min)", value: k.avg_cycle_minutes, icon: Clock, tone: "text-amber-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {cards.map(c => (
          <Card key={c.label} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{c.label}</span>
              <c.icon className={`h-4 w-4 ${c.tone}`} />
            </div>
            <div className="text-2xl font-bold tabular-nums">{c.value ?? 0}</div>
          </Card>
        ))}
      </div>

      {k.by_platform && Object.keys(k.by_platform).length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Produção por Plataforma (30d)</h3>
          </div>
          <div className="space-y-2">
            {Object.entries(k.by_platform)
              .sort((a, b) => (b[1] as number) - (a[1] as number))
              .map(([name, count]) => {
                const max = Math.max(...Object.values(k.by_platform).map(v => Number(v)));
                const pct = max > 0 ? (Number(count) / max) * 100 : 0;
                return (
                  <div key={name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{name}</span>
                      <span className="font-mono text-muted-foreground">{count as number}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      )}
    </div>
  );
}
