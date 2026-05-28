import { useMemo } from "react";
import { Clock, AlertTriangle, AlertOctagon } from "lucide-react";
import { useAgingAlerts, type AlertLevel } from "@/hooks/useAgingAlerts";

/**
 * Aging Alerts Widget — derived state from useAgingAlerts.
 * No new providers, no extra queries, no realtime channel.
 * Just counts buckets by level/type to keep the dashboard light.
 */
export function AgingAlertsWidget() {
  const { data: alerts = [], isLoading } = useAgingAlerts();

  const buckets = useMemo(() => {
    const b = {
      level1: { count: 0, so: 0, po: 0, inv: 0 },
      level2: { count: 0, so: 0, po: 0, inv: 0 },
      level3: { count: 0, so: 0, po: 0, inv: 0 },
    };
    for (const a of alerts) {
      const lvl = a.level as Exclude<AlertLevel, "none">;
      if (!(lvl in b)) continue;
      b[lvl].count += 1;
      if (a.type === "service_order") b[lvl].so += 1;
      else if (a.type === "payment_order") b[lvl].po += 1;
      else if (a.type === "invoice") b[lvl].inv += 1;
    }
    return b;
  }, [alerts]);

  if (!isLoading && alerts.length === 0) return null;

  const cells: Array<{
    label: string; sub: string; level: Exclude<AlertLevel, "none">;
    tone: string; icon: any; data: { count: number; so: number; po: number; inv: number };
  }> = [
    {
      label: "Aging moderado", sub: "≥ 30 dias", level: "level1",
      tone: "border-amber-500/30 bg-amber-500/5 text-amber-400",
      icon: Clock, data: buckets.level1,
    },
    {
      label: "Aging elevado", sub: "≥ 60 dias", level: "level2",
      tone: "border-orange-500/40 bg-orange-500/5 text-orange-400",
      icon: AlertTriangle, data: buckets.level2,
    },
    {
      label: "Aging crítico", sub: "≥ 90 dias", level: "level3",
      tone: "border-red-500/50 bg-red-500/10 text-red-400",
      icon: AlertOctagon, data: buckets.level3,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {cells.map((c) => {
        const empty = c.data.count === 0;
        return (
          <div
            key={c.level}
            className={`glass-panel rounded-xl p-4 border ${empty ? "border-border/40 opacity-70" : c.tone}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
                  {c.label}
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">{c.sub}</div>
              </div>
              <c.icon className={`h-4 w-4 ${empty ? "text-muted-foreground/50" : ""}`} />
            </div>
            <div className="mt-2 text-[26px] leading-none font-semibold tabular-nums">
              {isLoading ? "—" : c.data.count}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground/80">
              <span>OS {c.data.so}</span>
              <span className="opacity-40">·</span>
              <span>OP {c.data.po}</span>
              <span className="opacity-40">·</span>
              <span>Fat {c.data.inv}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
