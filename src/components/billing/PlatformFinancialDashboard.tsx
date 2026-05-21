import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { TrendingUp, Users, AlertTriangle, RefreshCcw, Zap, Receipt } from "lucide-react";

export function PlatformFinancialDashboard() {
  const { data } = useQuery({
    queryKey: ["platform-financial-overview"],
    queryFn: async () => {
      const [subs, invoices, payments] = await Promise.all([
        supabase.from("workspace_subscriptions").select("status, billing_cycle, current_price"),
        supabase.from("platform_invoices").select("status, total, issued_at"),
        supabase.from("platform_subscription_cycles").select("status, amount"),
      ]);
      const subList = subs.data ?? [];
      const active = subList.filter((s: any) => s.status === "active");
      const trial = subList.filter((s: any) => s.status === "trial");
      const cancelled = subList.filter((s: any) => s.status === "cancelled");
      const mrr = active.reduce((sum: number, s: any) => {
        const p = Number(s.current_price || 0);
        return sum + (s.billing_cycle === "yearly" ? p / 12 : p);
      }, 0);
      const arr = mrr * 12;
      const invList = invoices.data ?? [];
      const failed = (payments.data ?? []).filter((p: any) => p.status === "failed").length;
      const overdue = invList.filter((i: any) => i.status === "overdue").length;
      const trialConv = subList.length ? Math.round((active.length / Math.max(1, active.length + trial.length)) * 100) : 0;
      return {
        mrr, arr,
        active: active.length,
        trial: trial.length,
        cancelled: cancelled.length,
        failed, overdue, trialConv,
      };
    },
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
