import { useState } from "react";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  RefreshCw, DollarSign, Percent, ArrowRightLeft, BarChart3,
  Users, Monitor, Wallet, Link2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/hooks/useLanguage";
import { useReconciliationSummary, useRunReconciliation } from "@/hooks/useReconciliation";
import { useConfrontoPending } from "@/hooks/useConfrontoOSOP";
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import FusaoManualTab from "@/components/confronto/FusaoManualTab";
import PendentesTab from "@/components/confronto/PendentesTab";
import HistoricoTab from "@/components/confronto/HistoricoTab";

const PIE_COLORS = [
  "hsl(152, 60%, 45%)", "hsl(0, 72%, 55%)", "hsl(38, 92%, 55%)", "hsl(210, 80%, 55%)"
];

export default function FinancialPage() {
  const { t, formatCurrency } = useLanguage();
  const { data: summary, isLoading: summaryLoading } = useReconciliationSummary();
  const { data: pendingItems = [] } = useConfrontoPending();
  const runMutation = useRunReconciliation();
  const [confrontoTab, setConfrontoTab] = useState("fusao");

  const isLoading = summaryLoading;
  const s = summary ?? {
    expectedRevenue: 0, receivedRevenue: 0, totalDifference: 0, discrepancyPct: 0,
    matched: 0, mismatched: 0, missing: 0, pending: 0, expenses: 0, profit: 0,
    monthly: [], byClient: [], byTechnician: [], byPlatform: [], alerts: [],
    serviceOrderCount: 0, paymentOrderCount: 0, activeDiscrepancies: 0,
  };

  const hasNoData = s.serviceOrderCount === 0 && s.paymentOrderCount === 0;

  const pieData = hasNoData ? [] : [
    { name: "Matched", value: s.matched },
    { name: "Mismatch", value: s.mismatched },
    { name: "Missing", value: s.missing },
    { name: "Pending", value: s.pending },
  ].filter(d => d.value > 0);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t("fin.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("fin.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingItems.length > 0 && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {pendingItems.length} divergência{pendingItems.length > 1 ? "s" : ""}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${runMutation.isPending ? "animate-spin" : ""}`} />
            {t("fin.refreshAnalysis")}
          </Button>
        </div>
      </div>

      {/* No-data empty state */}
      {hasNoData && (
        <Card className="border-border/50 bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Sem dados para análise</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Nenhuma ordem de serviço ou pagamento encontrada. Importe dados nas respetivas páginas.
            </p>
          </CardContent>
        </Card>
      )}

      {/* MAIN 3-TAB NAVIGATION */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="overview">Visão geral da receita</TabsTrigger>
          <TabsTrigger value="confronto" className="relative">
            Confronto OS × OP
            {pendingItems.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive/20 text-destructive text-[9px] px-1">
                {pendingItems.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="breakdown">Detalhamento</TabsTrigger>
        </TabsList>

        {/* ===================== VISÃO GERAL ===================== */}
        <TabsContent value="overview" className="space-y-4">
          {!hasNoData && (
            <>
              {/* KPI Row 1 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-border/50 glow-gold">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5" /> {t("fin.expectedRevenue")}
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
                      <DollarSign className="h-3.5 w-3.5" /> {t("fin.realRevenue")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold tabular-nums text-foreground">{formatCurrency(s.receivedRevenue)}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{s.paymentOrderCount} OP</p>
                  </CardContent>
                </Card>

                <Card className={`border-border/50 ${s.totalDifference > 0 ? "bg-destructive/5" : s.totalDifference < 0 ? "bg-emerald-500/5" : ""}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <ArrowRightLeft className="h-3.5 w-3.5" /> {t("fin.difference")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold tabular-nums ${s.totalDifference > 0 ? "text-destructive" : s.totalDifference < 0 ? "text-emerald-400" : "text-foreground"}`}>
                      {s.totalDifference > 0 ? "-" : s.totalDifference < 0 ? "+" : ""}{formatCurrency(Math.abs(s.totalDifference))}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Percent className="h-3.5 w-3.5" /> Discrepância %
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold tabular-nums ${s.discrepancyPct > 10 ? "text-destructive" : s.discrepancyPct > 5 ? "text-amber-500" : "text-emerald-400"}`}>
                      {s.discrepancyPct}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* KPI Row 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Wallet className="h-3.5 w-3.5" /> Despesas
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold tabular-nums text-foreground">{formatCurrency(s.expenses)}</p>
                  </CardContent>
                </Card>
                <Card className={`border-border/50 ${s.profit >= 0 ? "glow-green" : ""}`}>
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
                          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                            {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
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
            </>
          )}
        </TabsContent>

        {/* ===================== CONFRONTO OS × OP ===================== */}
        <TabsContent value="confronto" className="space-y-4">
          <Tabs value={confrontoTab} onValueChange={setConfrontoTab}>
            <TabsList className="bg-muted/50">
              <TabsTrigger value="fusao">
                <Link2 className="h-3.5 w-3.5 mr-1" /> Fusão manual
              </TabsTrigger>
              <TabsTrigger value="pendentes" className="relative">
                <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Pendentes
                {pendingItems.length > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive/20 text-destructive text-[9px] px-1">
                    {pendingItems.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="fusao">
              <FusaoManualTab />
            </TabsContent>
            <TabsContent value="pendentes">
              <PendentesTab />
            </TabsContent>
            <TabsContent value="historico">
              <HistoricoTab />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ===================== DETALHAMENTO ===================== */}
        <TabsContent value="breakdown" className="space-y-4">
          {!hasNoData && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1">
                    <Users className="h-4 w-4" /> Por cliente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {s.byClient.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={s.byClient.slice(0, 5)} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                        <Bar dataKey="expected" name="Esperado" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="received" name="Recebido" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>}
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1">
                    <Users className="h-4 w-4" /> Por técnico
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {s.byTechnician.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={s.byTechnician.slice(0, 5)} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                        <Bar dataKey="expected" name="Esperado" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="received" name="Recebido" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>}
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1">
                    <Monitor className="h-4 w-4" /> Por plataforma
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {s.byPlatform.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={s.byPlatform.slice(0, 5)} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                        <Bar dataKey="expected" name="Esperado" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="received" name="Recebido" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
