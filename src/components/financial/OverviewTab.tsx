import {
  TrendingUp, DollarSign, ArrowRightLeft, Percent, Wallet, CheckCircle,
  Users, Monitor, BarChart3, Crown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/hooks/useLanguage";
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";

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

  const topTechnicians = Object.values(s.byTechnician as Record<string, any>)
    .sort((a: any, b: any) => b.received - a.received)
    .slice(0, 5);

  const topClients = Object.values(s.byClient as Record<string, any>)
    .sort((a: any, b: any) => b.received - a.received)
    .slice(0, 5);

  const topPlatforms = Object.values(s.byPlatform as Record<string, any>)
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

        <Card className={`border-border/50 glow-red ${s.totalDifference > 0 ? "bg-destructive/5" : s.totalDifference < 0 ? "bg-emerald-500/5" : ""}`}>
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

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RankingCard title="Top técnicos" icon={<Crown className="h-4 w-4" />} items={topTechnicians} formatCurrency={formatCurrency} />
        <RankingCard title="Top clientes" icon={<Users className="h-4 w-4" />} items={topClients} formatCurrency={formatCurrency} />
        <RankingCard title="Top plataformas" icon={<Monitor className="h-4 w-4" />} items={topPlatforms} formatCurrency={formatCurrency} />
      </div>
    </div>
  );
}

function RankingCard({ title, icon, items, formatCurrency }: { title: string; icon: React.ReactNode; items: any[]; formatCurrency: (v: number) => string }) {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-1">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item: any, i: number) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold w-5 text-center ${i === 0 ? "text-amber-400" : i === 1 ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                    {i + 1}
                  </span>
                  <span className="text-sm text-foreground truncate max-w-[120px]">{item.name}</span>
                </div>
                <span className="text-sm font-medium tabular-nums text-foreground">{formatCurrency(item.received)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>
        )}
      </CardContent>
    </Card>
  );
}
