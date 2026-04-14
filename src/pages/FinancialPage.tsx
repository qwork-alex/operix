import { useState } from "react";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, DollarSign, Percent, Link2, ArrowRightLeft, BarChart3,
  Users, Monitor, Wallet
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/hooks/useLanguage";
import { useReconciliations, useRunReconciliation, useManualMerge, useReconciliationSummary } from "@/hooks/useReconciliation";
import { useServiceOrders } from "@/hooks/useServiceOrders";
import { usePaymentOrders } from "@/hooks/usePaymentOrders";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  AreaChart, Area, CartesianGrid, PieChart, Pie, Cell
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  matched: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  mismatch: "bg-destructive/10 text-destructive border-destructive/30",
  missing: "bg-warning/10 text-warning border-warning/30",
  pending: "bg-accent/10 text-accent border-accent/30",
};

const PIE_COLORS = [
  "hsl(152, 60%, 45%)", "hsl(0, 72%, 55%)", "hsl(38, 92%, 55%)", "hsl(210, 80%, 55%)"
];

export default function FinancialPage() {
  const { t, formatCurrency } = useLanguage();
  const { data: summary, isLoading: summaryLoading } = useReconciliationSummary();
  const { data: reconciliations = [], isLoading: recLoading } = useReconciliations();
  const runMutation = useRunReconciliation();
  const mergeMutation = useManualMerge();

  // Manual merge state
  const [selectedSO, setSelectedSO] = useState<string | null>(null);
  const [selectedPO, setSelectedPO] = useState<string | null>(null);
  const { data: soData } = useServiceOrders();
  const { data: poData } = usePaymentOrders();

  const isLoading = summaryLoading || recLoading;
  const s = summary ?? {
    expectedRevenue: 0, receivedRevenue: 0, totalDifference: 0, discrepancyPct: 0,
    matched: 0, mismatched: 0, missing: 0, pending: 0, expenses: 0, profit: 0,
    monthly: [], byClient: [], byTechnician: [], byPlatform: [], alerts: [],
    serviceOrderCount: 0, paymentOrderCount: 0,
  };

  const handleMerge = () => {
    if (selectedSO && selectedPO) {
      mergeMutation.mutate({ serviceOrderId: selectedSO, paymentOrderId: selectedPO });
      setSelectedSO(null);
      setSelectedPO(null);
    }
  };

  // UI GUARD: detect no-data state
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
        <Button variant="outline" size="sm" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
          <RefreshCw className={`h-4 w-4 mr-1 ${runMutation.isPending ? "animate-spin" : ""}`} />
          {t("fin.refreshAnalysis")}
        </Button>
      </div>

      {/* Alerts */}
      {s.alerts.length > 0 && (
        <div className="space-y-2">
          {s.alerts.map((a, i) => (
            <div key={i} className={`rounded-lg border p-3 text-sm flex items-center gap-2 ${
              a.severity === "high" ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-warning/30 bg-warning/5 text-warning"
            }`}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {a.message}
            </div>
          ))}
        </div>
      )}

      {/* No-data empty state */}
      {hasNoData && (
        <Card className="border-border/50 bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Sem dados para análise</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Nenhuma ordem de serviço ou pagamento encontrada. Importe dados nas respetivas páginas para iniciar a reconciliação financeira.
            </p>
          </CardContent>
        </Card>
      )}

      {!hasNoData && <>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/50 glow-gold">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> {t("fin.expectedRevenue")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-foreground">{formatCurrency(s.expectedRevenue)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{s.serviceOrderCount} {t("nav.serviceOrders").toLowerCase()}</p>
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
            <p className="text-[11px] text-muted-foreground mt-1">{s.paymentOrderCount} {t("nav.paymentOrders").toLowerCase()}</p>
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
            <p className="text-[11px] text-muted-foreground mt-1">
              {s.totalDifference > 0 ? t("fin.missingMoney") : s.totalDifference < 0 ? t("fin.overpayment") : t("fin.balanced")}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Percent className="h-3.5 w-3.5" /> {t("fin.discrepancies")} %
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold tabular-nums ${s.discrepancyPct > 10 ? "text-destructive" : s.discrepancyPct > 5 ? "text-warning" : "text-emerald-400"}`}>
              {s.discrepancyPct}%
            </p>
            <div className="flex gap-2 mt-1 text-[11px]">
              <span className="text-emerald-400">{s.matched} ✓</span>
              <span className="text-destructive">{s.mismatched} ✗</span>
              <span className="text-warning">{s.missing} ?</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Row 2: Expenses & Profit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5" /> {t("acc.totalExpenses")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-foreground">{formatCurrency(s.expenses)}</p>
          </CardContent>
        </Card>
        <Card className={`border-border/50 ${s.profit >= 0 ? "glow-green" : ""}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> {t("acc.netResult")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold tabular-nums ${s.profit >= 0 ? "text-emerald-400" : "text-destructive"}`}>
              {formatCurrency(s.profit)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">{t("fin.realRevenue")} - {t("acc.totalExpenses")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="overview">{t("dashboard.revenueOverview")}</TabsTrigger>
          <TabsTrigger value="reconciliations">{t("fin.discrepancyDetails")}</TabsTrigger>
          <TabsTrigger value="breakdown">{t("fin.breakdown")}</TabsTrigger>
          <TabsTrigger value="merge">{t("fin.manualMatch")}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Monthly revenue chart */}
            <Card className="border-border/50 lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("dashboard.monthlyRevExp")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={s.monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                    <Legend />
                    <Area type="monotone" dataKey="expected" name={t("fin.expectedRevenue")} stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="received" name={t("fin.realRevenue")} stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="expenses" name={t("chart.expenses")} stroke="hsl(var(--chart-5))" fill="hsl(var(--chart-5))" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Reconciliation status pie */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("fin.reconciliationStatus")}</CardTitle>
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
                    {t("fin.noDiscrepancies")}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Reconciliation Details Tab */}
        <TabsContent value="reconciliations">
          <Card className="border-border/50">
            <CardContent className="pt-4">
              {reconciliations.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                  {s.serviceOrderCount === 0 && s.paymentOrderCount === 0
                    ? "Nenhuma ordem encontrada. Importe dados para iniciar a reconciliação."
                    : t("fin.noDiscrepancies")}
                </div>
              ) : (
                <div className="space-y-2">
                  {reconciliations.map((r: any) => {
                    const pn = r.parsed_notes || {};
                    const soPlate = pn.so_plate || r.service_orders?.license_plate || "—";
                    const poPlate = pn.po_plate || r.payment_orders?.license_plate || "—";
                    const soClient = pn.so_client || r.service_orders?.client_name || "—";
                    const poClient = pn.po_client || r.payment_orders?.client_name || "—";
                    const soTotal = pn.so_total ?? Number(r.service_orders?.total || 0);
                    const poTotal = pn.po_total ?? Number(r.payment_orders?.total || 0);

                    return (
                      <div key={r.id} className="rounded-lg border border-border/50 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={STATUS_COLORS[r.status] || ""}>
                              {r.status === "matched" ? <CheckCircle className="h-3 w-3 mr-1" /> :
                               r.status === "mismatch" ? <XCircle className="h-3 w-3 mr-1" /> :
                               r.status === "missing" ? <AlertTriangle className="h-3 w-3 mr-1" /> :
                               <Link2 className="h-3 w-3 mr-1" />}
                              {r.status}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {r.matched_by === "auto" ? "Auto" : "Manual"}
                            </Badge>
                            <span className={`text-[10px] tabular-nums ${Number(r.confidence_score) >= 70 ? "text-emerald-400" : Number(r.confidence_score) >= 40 ? "text-warning" : "text-muted-foreground"}`}>
                              Score: {r.confidence_score}%
                            </span>
                          </div>
                          <span className={`text-sm font-bold tabular-nums ${
                            r.difference_amount > 0 ? "text-destructive" : r.difference_amount < 0 ? "text-emerald-400" : "text-foreground"
                          }`}>
                            {r.difference_amount > 0 ? "-" : r.difference_amount < 0 ? "+" : ""}{formatCurrency(Math.abs(Number(r.difference_amount)))}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="space-y-1">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase">Ordem de Serviço</p>
                            {r.service_orders ? (
                              <>
                                <p><span className="text-muted-foreground">Placa:</span> {soPlate}</p>
                                <p><span className="text-muted-foreground">Cliente:</span> {soClient}</p>
                                <p><span className="text-muted-foreground">Valor:</span> {formatCurrency(soTotal)}</p>
                              </>
                            ) : <p className="text-muted-foreground italic">Sem OS correspondente</p>}
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase">Ordem de Pagamento</p>
                            {r.payment_orders ? (
                              <>
                                <p><span className="text-muted-foreground">Placa:</span> {poPlate}</p>
                                <p><span className="text-muted-foreground">Cliente:</span> {poClient}</p>
                                <p><span className="text-muted-foreground">Valor:</span> {formatCurrency(poTotal)}</p>
                              </>
                            ) : <p className="text-muted-foreground italic">Sem pagamento correspondente</p>}
                          </div>
                        </div>

                        {pn.explanation && (
                          <p className="text-[11px] text-muted-foreground bg-muted/50 rounded p-2">
                            💡 {pn.explanation}
                          </p>
                        )}

                        {pn.match_reasons && pn.match_reasons.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {pn.match_reasons.map((reason: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-[9px] px-1.5 py-0">
                                {reason}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Breakdown Tab */}
        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* By Client */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1">
                  <Users className="h-4 w-4" /> {t("label.client")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {s.byClient.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={s.byClient.slice(0, 5)} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                      <Bar dataKey="expected" name={t("fin.expected")} fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="received" name={t("fin.received")} fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-xs text-muted-foreground text-center py-4">{t("fin.noData")}</p>}
              </CardContent>
            </Card>

            {/* By Technician */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1">
                  <Users className="h-4 w-4" /> {t("label.technician")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {s.byTechnician.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={s.byTechnician.slice(0, 5)} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                      <Bar dataKey="expected" name={t("fin.expected")} fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="received" name={t("fin.received")} fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-xs text-muted-foreground text-center py-4">{t("fin.noData")}</p>}
              </CardContent>
            </Card>

            {/* By Platform */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1">
                  <Monitor className="h-4 w-4" /> {t("label.platform")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {s.byPlatform.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={s.byPlatform.slice(0, 5)} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                      <Bar dataKey="expected" name={t("fin.expected")} fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="received" name={t("fin.received")} fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-xs text-muted-foreground text-center py-4">{t("fin.noData")}</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Manual Merge Tab */}
        <TabsContent value="merge">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
               <CardTitle className="text-sm font-medium flex items-center gap-2">
                 <Link2 className="h-4 w-4" /> {t("fin.manualMatch")}
               </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">{t("fin.selectToMerge")}</p>

              {selectedSO && selectedPO && (
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleMerge} disabled={mergeMutation.isPending}>
                    <Link2 className="h-4 w-4 mr-1" />
                    {t("fin.mergeRecords")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setSelectedSO(null); setSelectedPO(null); }}>
                    {t("action.cancel")}
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Service Orders */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">{t("nav.serviceOrders")}</h3>
                  <div className="rounded-lg border border-border/50 overflow-auto max-h-64">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[11px]">
                          <TableHead className="w-8"></TableHead>
                          <TableHead>{t("label.plate")}</TableHead>
                          <TableHead>{t("label.car")}</TableHead>
                          <TableHead className="text-right">{t("label.total")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(soData ?? []).slice(0, 50).map((so: any) => (
                          <TableRow key={so.id} className={`text-xs cursor-pointer ${selectedSO === so.id ? "bg-primary/10" : ""}`}
                            onClick={() => setSelectedSO(selectedSO === so.id ? null : so.id)}>
                            <TableCell>
                              <Checkbox checked={selectedSO === so.id} />
                            </TableCell>
                            <TableCell>{so.license_plate || "—"}</TableCell>
                            <TableCell>{so.car_name || "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(Number(so.total || 0))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Payment Orders */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">{t("nav.paymentOrders")}</h3>
                  <div className="rounded-lg border border-border/50 overflow-auto max-h-64">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[11px]">
                          <TableHead className="w-8"></TableHead>
                          <TableHead>{t("label.plate")}</TableHead>
                          <TableHead>{t("label.car")}</TableHead>
                          <TableHead className="text-right">{t("label.total")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(poData ?? []).slice(0, 50).map((po: any) => (
                          <TableRow key={po.id} className={`text-xs cursor-pointer ${selectedPO === po.id ? "bg-primary/10" : ""}`}
                            onClick={() => setSelectedPO(selectedPO === po.id ? null : po.id)}>
                            <TableCell>
                              <Checkbox checked={selectedPO === po.id} />
                            </TableCell>
                            <TableCell>{po.license_plate || "—"}</TableCell>
                            <TableCell>{po.car_name || "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(Number(po.total || 0))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </>}
    </div>
  );
}
