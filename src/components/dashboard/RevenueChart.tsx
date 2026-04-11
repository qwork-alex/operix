import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { useLanguage } from "@/hooks/useLanguage";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";

function useRevenueChartData() {
  return useQuery({
    queryKey: ["revenue-chart-data"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_orders")
        .select("total, status, created_at")
        .in("status", ["paid", "partial", "pending"]);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function RevenueChart() {
  const { t, formatCurrency } = useLanguage();
  const { data: orders, isLoading } = useRevenueChartData();

  const chartData = useMemo(() => {
    if (!orders?.length) return [];

    const monthMap = new Map<string, { received: number; pending: number }>();

    for (const o of orders) {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = monthMap.get(key) ?? { received: 0, pending: 0 };
      const total = Number(o.total || 0);

      if (o.status === "paid") {
        entry.received += total;
      } else if (o.status === "partial") {
        entry.received += total * 0.5;
        entry.pending += total * 0.5;
      } else {
        entry.pending += total;
      }

      monthMap.set(key, entry);
    }

    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({
        month: months[parseInt(key.split("-")[1]) - 1],
        received: Math.round(val.received * 100) / 100,
        pending: Math.round(val.pending * 100) / 100,
      }));
  }, [orders]);

  if (isLoading) {
    return <Skeleton className="h-[340px] rounded-xl" />;
  }

  return (
    <div className="glass-panel rounded-xl p-5 animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("chart.revenueOverview")}</h3>
          <p className="text-xs text-muted-foreground">{t("chart.monthlyRevExp")}</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">{t("chart.revenue")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-muted-foreground">Pendências</span>
          </div>
        </div>
      </div>
      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
          Nenhum dado de pagamento disponível
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(43, 85%, 55%)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(43, 85%, 55%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(0, 70%, 55%)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="hsl(0, 70%, 55%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 18%)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: "hsl(220, 10%, 50%)", fontSize: 11 }}
              axisLine={{ stroke: "hsl(220, 12%, 18%)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "hsl(220, 10%, 50%)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `€${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(220, 14%, 11%)",
                border: "1px solid hsl(220, 12%, 18%)",
                borderRadius: "8px",
                fontSize: 12,
                color: "hsl(40, 10%, 92%)",
              }}
              formatter={(value: any, name: string) => [
                `€${Number(value || 0).toLocaleString()}`,
                name === "received" ? "Receita" : "Pendências",
              ]}
            />
            <Area
              type="monotone"
              dataKey="received"
              stroke="hsl(43, 85%, 55%)"
              strokeWidth={2}
              fill="url(#goldGrad)"
            />
            <Area
              type="monotone"
              dataKey="pending"
              stroke="hsl(0, 70%, 55%)"
              strokeWidth={2}
              fill="url(#redGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
