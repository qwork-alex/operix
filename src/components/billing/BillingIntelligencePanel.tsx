import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, TrendingDown, AlertTriangle, Users, Activity } from "lucide-react";
import { useBillingIntelligence } from "@/hooks/useAutomation";
import { cn } from "@/lib/utils";

const RISK_TONE: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  high: "bg-red-500/10 text-red-500 border-red-500/30",
};

const ANOMALY_TONE: Record<string, string> = {
  normal: "bg-sky-500/10 text-sky-500 border-sky-500/30",
  spike: "bg-violet-500/10 text-violet-500 border-violet-500/30",
  drop: "bg-amber-500/10 text-amber-500 border-amber-500/30",
};

export function BillingIntelligencePanel({ workspaceId }: { workspaceId?: string | null }) {
  const { data, isLoading } = useBillingIntelligence(workspaceId);

  if (isLoading) {
    return (
      <Card className="p-5 surface-card">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Brain className="h-4 w-4 animate-pulse text-violet-500" /> A analisar…
        </div>
      </Card>
    );
  }

  if (!data || data.error) {
    return (
      <Card className="p-5 surface-card text-xs text-muted-foreground">
        Sem dados de inteligência disponíveis para esta workspace.
      </Card>
    );
  }

  const growth = Number(data.technician_growth_pct ?? 0);
  const GrowthIcon = growth >= 0 ? TrendingUp : TrendingDown;

  return (
    <Card className="p-5 surface-card relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-transparent"
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-violet-500/10 border border-violet-500/30 grid place-items-center">
              <Brain className="h-4 w-4 text-violet-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Inteligência de billing</h3>
              <p className="text-[10px] text-muted-foreground">
                Análise automática · {new Date(data.computed_at).toLocaleTimeString("pt-PT")}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px]">{String(data.status ?? "—")}</Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Metric
            label="Risco de churn"
            value={String(data.churn_risk ?? "low")}
            tone={RISK_TONE[String(data.churn_risk ?? "low")]}
            icon={AlertTriangle}
          />
          <Metric
            label="Prob. downgrade"
            value={String(data.downgrade_probability ?? "low")}
            tone={RISK_TONE[String(data.downgrade_probability ?? "low")]}
            icon={TrendingDown}
          />
          <Metric
            label="Anomalia"
            value={String(data.growth_anomaly ?? "normal")}
            tone={ANOMALY_TONE[String(data.growth_anomaly ?? "normal")]}
            icon={Activity}
          />
          <Metric
            label="Técnicos"
            value={`${data.technician_count ?? 0}`}
            tone="bg-sky-500/10 text-sky-500 border-sky-500/30"
            icon={Users}
          />
          <Metric
            label="Crescimento 30d"
            value={`${growth > 0 ? "+" : ""}${growth}%`}
            tone={growth >= 0 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" : "bg-amber-500/10 text-amber-500 border-amber-500/30"}
            icon={GrowthIcon}
          />
          <Metric
            label="Inactividade"
            value={`${data.days_since_activity ?? 0}d`}
            tone={data.inactive ? "bg-amber-500/10 text-amber-500 border-amber-500/30" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"}
            icon={Activity}
          />
        </div>

        {Number(data.failed_payments_60d ?? 0) > 0 && (
          <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
            {data.failed_payments_60d} pagamento(s) falhado(s) nos últimos 60 dias.
          </div>
        )}
      </div>
    </Card>
  );
}

function Metric({
  label, value, tone, icon: Icon,
}: { label: string; value: string; tone: string; icon: any }) {
  return (
    <div className={cn("rounded-md border px-3 py-2.5", tone)}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-80">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-sm font-semibold mt-1 capitalize">{value}</div>
    </div>
  );
}
