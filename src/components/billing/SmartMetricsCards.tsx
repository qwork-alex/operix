import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Users, Activity, CircleDollarSign, Sparkles } from "lucide-react";
import { usePlatformSmartMetrics } from "@/hooks/useAutomation";
import { cn } from "@/lib/utils";

export function SmartMetricsCards() {
  const { data, isLoading } = usePlatformSmartMetrics();

  if (isLoading) {
    return <Card className="p-5 surface-card text-xs text-muted-foreground">A calcular métricas…</Card>;
  }

  const growth = Number(data?.mrr_growth_pct ?? 0);
  const GrowthIcon = growth >= 0 ? TrendingUp : TrendingDown;

  const items = [
    { label: "MRR", value: `${Number(data?.mrr ?? 0).toFixed(2)} €`, sub: "Mensal recorrente", tone: "amber", icon: CircleDollarSign },
    { label: "ARR", value: `${Number(data?.arr ?? 0).toFixed(2)} €`, sub: "Anual recorrente", tone: "amber", icon: CircleDollarSign },
    { label: "Crescimento MRR", value: `${growth > 0 ? "+" : ""}${growth}%`, sub: "vs 30 dias", tone: growth >= 0 ? "emerald" : "red", icon: GrowthIcon },
    { label: "Subscrições activas", value: `${data?.active_subscriptions ?? 0}`, sub: `${data?.trial_subscriptions ?? 0} em trial`, tone: "sky", icon: Users },
    { label: "Churn 30d", value: `${data?.churn_rate_pct ?? 0}%`, sub: `Retenção ${data?.retention_pct ?? 0}%`, tone: "violet", icon: Activity },
    { label: "ARR projectado", value: `${Number(data?.projected_arr ?? 0).toFixed(0)} €`, sub: "Próximos 12m", tone: "violet", icon: Sparkles },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map((m) => <KPI key={m.label} {...m} />)}
    </div>
  );
}

const TONE: Record<string, string> = {
  amber: "from-amber-500/10 border-amber-500/20 text-amber-500",
  emerald: "from-emerald-500/10 border-emerald-500/20 text-emerald-500",
  red: "from-red-500/10 border-red-500/20 text-red-500",
  sky: "from-sky-500/10 border-sky-500/20 text-sky-500",
  violet: "from-violet-500/10 border-violet-500/20 text-violet-500",
};

function KPI({ label, value, sub, tone, icon: Icon }: any) {
  return (
    <Card className={cn(
      "p-4 surface-card border bg-gradient-to-br to-transparent relative overflow-hidden",
      TONE[tone] ?? TONE.sky,
    )}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-80">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-xl font-semibold mt-1.5 text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </Card>
  );
}
