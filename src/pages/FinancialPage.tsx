import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, XCircle, RefreshCw, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useFinancialSummary, useDiscrepancies, useDiscrepancyDetection } from "@/hooks/usePaymentOrders";

function fmt(v: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v);
}

export default function FinancialPage() {
  const { data: summary, isLoading: summaryLoading } = useFinancialSummary();
  const { data: discrepancies = [], isLoading: discLoading } = useDiscrepancies();
  const detectMutation = useDiscrepancyDetection();

  const isLoading = summaryLoading || discLoading;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const s = summary!;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Financial Intelligence</h1>
            <p className="text-xs text-muted-foreground">Expected vs Real revenue comparison</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => detectMutation.mutate()}
          disabled={detectMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${detectMutation.isPending ? "animate-spin" : ""}`} />
          Refresh Analysis
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Expected Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-foreground">{fmt(s.expectedRevenue)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">From service orders</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" /> Real Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-foreground">{fmt(s.realRevenue)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">From payment orders</p>
          </CardContent>
        </Card>

        <Card className={`border-border/50 ${s.difference > 0 ? "bg-red-500/5" : s.difference < 0 ? "bg-emerald-500/5" : ""}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              {s.difference > 0 ? <TrendingDown className="h-3.5 w-3.5 text-red-400" /> : <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
              Difference
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold tabular-nums ${s.difference > 0 ? "text-red-400" : s.difference < 0 ? "text-emerald-400" : "text-foreground"}`}>
              {s.difference > 0 ? "-" : s.difference < 0 ? "+" : ""}{fmt(Math.abs(s.difference))}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {s.difference > 0 ? "Missing money" : s.difference < 0 ? "Overpayment" : "Balanced"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Discrepancies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-foreground">{s.totalDiscrepancies}</p>
            <div className="flex gap-2 mt-1">
              <span className="text-[11px] text-red-400">{s.missingCount} missing</span>
              <span className="text-[11px] text-amber-400">{s.mismatchCount} mismatch</span>
              <span className="text-[11px] text-emerald-400">{s.correctCount} ok</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Discrepancy Table */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Discrepancy Details</CardTitle>
        </CardHeader>
        <CardContent>
          {discrepancies.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
              No discrepancies detected. All payments are matching.
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead>Type</TableHead>
                    <TableHead>Service Order</TableHead>
                    <TableHead>Payment Order</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Gap</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discrepancies.map((d: any) => {
                    const gap = Number(d.expected_value || 0) - Number(d.received_value || 0);
                    return (
                      <TableRow key={d.id} className="text-xs">
                        <TableCell>
                          <Badge variant="outline" className={d.issue_type === "missing"
                            ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          }>
                            {d.issue_type === "missing" ? <XCircle className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                            {d.issue_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {d.service_orders ? (
                            <span>{d.service_orders.car_name || d.service_orders.license_plate || "—"}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {d.payment_orders ? (
                            <span>{d.payment_orders.car_name || d.payment_orders.license_plate || "—"}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(d.expected_value || 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(d.received_value || 0)}</TableCell>
                        <TableCell className={`text-right tabular-nums font-medium ${gap > 0 ? "text-red-400" : "text-emerald-400"}`}>
                          {gap > 0 ? "-" : "+"}{fmt(Math.abs(gap))}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={d.resolved
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-red-500/10 text-red-400 border-red-500/30"
                          }>
                            {d.resolved ? "Resolved" : "Open"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
