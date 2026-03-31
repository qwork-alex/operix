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
    <div className={`glass-panel rounded-xl p-5 animate-fade-in ${glowClass}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <div className="flex items-center gap-1">
            {isPositive ? (
              <TrendingUp className="h-3.5 w-3.5 text-success" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            )}
            <span className={`text-xs font-medium ${isPositive ? "text-success" : "text-destructive"}`}>
              {isPositive ? "+" : ""}{change}%
            </span>
            <span className="text-xs text-muted-foreground">{t("chart.vsLastMonth")}</span>
          </div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-primary">
          {icon}
        </div>
      </div>
    </div>
  );
}