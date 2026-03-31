import { FileText, CreditCard, CheckCircle2, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

export function RecentActivity() {
  const { t } = useLanguage();

  const activities = [
    {
      icon: <FileText className="h-4 w-4" />,
      color: "text-accent",
      title: `${t("activity.newSO")} #1247`,
      desc: "Marc Durand — Lyon",
      time: `12 ${t("activity.minAgo")}`,
    },
    {
      icon: <CreditCard className="h-4 w-4" />,
      color: "text-primary",
      title: `${t("activity.paymentReceived")} €2 450`,
      desc: "AutoFleet",
      time: `34 ${t("activity.minAgo")}`,
    },
    {
      icon: <CheckCircle2 className="h-4 w-4" />,
      color: "text-success",
      title: t("activity.serviceCompleted"),
      desc: `${t("activity.vehicle")} AB-123-CD`,
      time: `1${t("activity.hAgo")}`,
    },
    {
      icon: <AlertTriangle className="h-4 w-4" />,
      color: "text-warning",
      title: t("activity.priceMismatch"),
      desc: `${t("activity.order")} #1239 — €85 ${t("activity.difference")}`,
      time: `2${t("activity.hAgo")}`,
    },
    {
      icon: <FileText className="h-4 w-4" />,
      color: "text-accent",
      title: `${t("activity.newSO")} #1246`,
      desc: "Sophie Laurent — Geneva",
      time: `3${t("activity.hAgo")}`,
    },
  ];

  return (
    <div className="glass-panel rounded-xl p-5 animate-fade-in">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{t("chart.recentActivity")}</h3>
        <p className="text-xs text-muted-foreground">{t("chart.latestOps")}</p>
      </div>
      <div className="space-y-3">
        {activities.map((a, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted/50"
          >
            <div className={`mt-0.5 ${a.color}`}>{a.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
              <p className="text-xs text-muted-foreground">{a.desc}</p>
            </div>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{a.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}