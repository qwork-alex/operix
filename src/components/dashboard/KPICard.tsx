import { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

interface KPICardProps {
  title: string;
  value: string;
  change: number;
  icon: ReactNode;
  glowClass?: string;
}

export function KPICard({ title, value, change, icon, glowClass = "" }: KPICardProps) {
  const { t } = useLanguage();
  const isPositive = change >= 0;

  return (
    <div className={`glass-panel rounded-xl p-5 ${glowClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
            {title}
          </p>
          <p className="text-[26px] leading-none font-semibold tracking-tight tabular-nums text-foreground">
            {value}
          </p>
          <div className="flex items-center gap-1 pt-0.5">
            {isPositive ? (
              <TrendingUp className="h-3 w-3 text-success" />
            ) : (
              <TrendingDown className="h-3 w-3 text-destructive" />
            )}
            <span
              className={`text-[11px] font-medium tabular-nums ${
                isPositive ? "text-success" : "text-destructive"
              }`}
            >
              {isPositive ? "+" : ""}
              {change}%
            </span>
            <span className="text-[11px] text-muted-foreground">{t("chart.vsLastMonth")}</span>
          </div>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-primary">
          {icon}
        </div>
      </div>
    </div>
  );
}
