import {
  TrendingUp, DollarSign, ArrowRightLeft, Percent, Wallet, CheckCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/hooks/useLanguage";
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import ExpensesByCategoryCard from "./ExpensesByCategoryCard";

const PIE_COLORS = [
  "hsl(152, 60%, 45%)", "hsl(0, 72%, 55%)", "hsl(38, 92%, 55%)", "hsl(210, 80%, 55%)"
];

interface OverviewTabProps {
  summary: any;
  hasNoData: boolean;
}

export default function OverviewTab({ summary: s, hasNoData }: OverviewTabProps) {
  const { formatCurrency } = useLanguage();

  const pieData = hasNoData ? [] : [
    { name: "Matched", value: s.matched },
    { name: "Mismatch", value: s.mismatched },
    { name: "Missing", value: s.missing },
    { name: "Pending", value: s.pending },
  ].filter((d: any) => d.value > 0);

  const topTechnicians = (Array.isArray(s.byTechnician) ? s.byTechnician : Object.values(s.byTechnician as Record<string, any>))
    .sort((a: any, b: any) => b.received - a.received)
    .slice(0, 5);

  const topClients = (Array.isArray(s.byClient) ? s.byClient : Object.values(s.byClient as Record<string, any>))
    .sort((a: any, b: any) => b.received - a.received)
    .slice(0, 5);

  const topPlatforms = (Array.isArray(s.byPlatform) ? s.byPlatform : Object.values(s.byPlatform as Record<string, any>))
    .sort((a: any, b: any) => b.received - a.received)
    .slice(0, 5);

  if (hasNoData) return null;

  return (
    <div className="space-y-4">
      {/* KPI Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/50 glow-gold">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Receita esperada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-foreground">{formatCurrency(s.expectedRevenue)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{s.serviceOrderCount} OS</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 glow-blue">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" /> Receita real
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-foreground">{formatCurrency(s.receivedRevenue)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{s.paymentOrderCount} OP</p>
          </CardContent>
        </Card>

        <Card className={`border-border/50 ${s.totalDifference > 0 ? "glow-red" : s.totalDifference < 0 ? "glow-green" : ""}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <ArrowRightLeft className="h-3.5 w-3.5" /> Diferença
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold tabular-nums ${s.totalDifference > 0 ? "text-destructive" : s.totalDifference < 0 ? "text-emerald-400" : "text-foreground"}`}>
              {s.totalDifference > 0 ? "-" : s.totalDifference < 0 ? "+" : ""}{formatCurrency(Math.abs(s.totalDifference))}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 glow-purple">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Percent className="h-3.5 w-3.5" /> Discrepância %
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold tabular-nums ${s.discrepancyPct > 10 ? "text-destructive" : s.discrepancyPct > 5 ? "text-amber-500" : "text-emerald-400"}`}>
              {s.discrepancyPct.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-border/50 glow-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5" /> Despesas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-foreground">{formatCurrency(s.expenses)}</p>
          </CardContent>
        </Card>
        <Card className={`border-border/50 ${s.profit >= 0 ? "glow-green" : "glow-red"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Resultado líquido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold tabular-nums ${s.profit >= 0 ? "text-emerald-400" : "text-destructive"}`}>
              {formatCurrency(s.profit)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-border/50 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Receita mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={s.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                <Legend />
                <Area type="monotone" dataKey="expected" name="Esperado" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.2} />
                <Area type="monotone" dataKey="received" name="Recebido" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status reconciliação</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }: any) => `${name}: ${value}`}>
                    {pieData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                Sem discrepâncias
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rankings — Horizontal Bar Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RankingBarChart title="Top técnicos" data={topTechnicians} formatCurrency={formatCurrency} />
        <RankingBarChart title="Top clientes" data={topClients} formatCurrency={formatCurrency} />
        <RankingBarChart title="Top plataformas" data={topPlatforms} formatCurrency={formatCurrency} />
      </div>
    </div>
  );
}

function RankingBarChart({ title, data, formatCurrency }: { title: string; data: any[]; formatCurrency: (v: number) => string }) {
  if (data.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((item: any) => ({
    name: (item.name || "").length > 12 ? (item.name || "").slice(0, 12) + "…" : (item.name || ""),
    Esperado: item.expected ?? 0,
    Recebido: item.received ?? 0,
  }));

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} width={80} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))", fontSize: 12 }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Bar dataKey="Esperado" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} barSize={10} />
            <Bar dataKey="Recebido" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} barSize={10} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
