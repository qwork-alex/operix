import { FileText, CreditCard, CheckCircle2, AlertTriangle } from "lucide-react";

const activities = [
  {
    icon: <FileText className="h-4 w-4" />,
    color: "text-accent",
    title: "New service order #1247",
    desc: "Marc Durand — Lyon",
    time: "12 min ago",
  },
  {
    icon: <CreditCard className="h-4 w-4" />,
    color: "text-primary",
    title: "Payment received €2,450",
    desc: "Platform AutoFleet",
    time: "34 min ago",
  },
  {
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-success",
    title: "Service completed",
    desc: "Vehicle AB-123-CD",
    time: "1h ago",
  },
  {
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "text-warning",
    title: "Price mismatch detected",
    desc: "Order #1239 — €85 difference",
    time: "2h ago",
  },
  {
    icon: <FileText className="h-4 w-4" />,
    color: "text-accent",
    title: "New service order #1246",
    desc: "Sophie Laurent — Geneva",
    time: "3h ago",
  },
];

export function RecentActivity() {
  return (
    <div className="glass-panel rounded-xl p-5 animate-fade-in">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
        <p className="text-xs text-muted-foreground">Latest operations</p>
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
