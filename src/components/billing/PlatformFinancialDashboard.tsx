import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { TrendingUp, Users, AlertTriangle, RefreshCcw, Zap, Receipt } from "lucide-react";

export function PlatformFinancialDashboard() {
  const { data } = useQuery({
    queryKey: ["platform-financial-overview"],
    queryFn: async () => apiRequest<{
      mrr: number;
      arr: number;
      active: number;
      trial: number;
      cancelled: number;
      failed: number;
      overdue: number;
      trialConv: number;
    }>("/billing/admin/financial-overview"),
  });

  const items = [
    { icon: TrendingUp, label: "MRR", value: `€${(data?.mrr ?? 0).toFixed(2)}`, tone: "text-emerald-500" },
    { icon: Zap, label: "ARR", value: `€${(data?.arr ?? 0).toFixed(0)}`, tone: "text-primary" },
    { icon: Users, label: "Assinaturas ativas", value: String(data?.active ?? 0), tone: "text-sky-500" },
    { icon: Receipt, label: "Em avaliação", value: String(data?.trial ?? 0), tone: "text-amber-500" },
    { icon: AlertTriangle, label: "Faturas em atraso", value: String(data?.overdue ?? 0), tone: "text-orange-500" },
    { icon: RefreshCcw, label: "Pagamentos falhados", value: String(data?.failed ?? 0), tone: "text-red-500" },
    { icon: TrendingUp, label: "Conversão de trial", value: `${data?.trialConv ?? 0}%`, tone: "text-emerald-500" },
    { icon: AlertTriangle, label: "Churn (canceladas)", value: String(data?.cancelled ?? 0), tone: "text-muted-foreground" },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <Card key={it.label} className="p-4 surface-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{it.label}</span>
            <it.icon className={`h-4 w-4 ${it.tone}`} />
          </div>
          <div className="mt-2 text-2xl font-semibold">{it.value}</div>
        </Card>
      ))}
    </div>
  );
}
