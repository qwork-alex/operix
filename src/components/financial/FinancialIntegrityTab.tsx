import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, AlertTriangle, Activity, RefreshCw, FileWarning, GitCompareArrows } from "lucide-react";
import { useFinancialIntegrity, useRunIntegrityCheck, type IntegrityFilters } from "@/hooks/useFinancialIntegrity";
import { computeKpis, severityBadgeBg } from "@/lib/integrityDiagnostics";
import { reconcileTotal } from "@/lib/reconciliationMath";
import { useLanguage } from "@/hooks/useLanguage";
import { IntegrityTimeline } from "./IntegrityTimeline";

const ISSUE_TYPES = [
  "duplicate_event","orphan_record","mismatch_total","invalid_distribution",
  "stale_summary","workspace_leak","year_leak","negative_balance",
  "missing_reference","broken_sync","invalid_participation","impossible_amount",
  "duplicate_hash","reconciliation_failure","drift_detected",
];

export default function FinancialIntegrityTab() {
  const { t, formatCurrency } = useLanguage();
  const currentYear = new Date().getFullYear();
  const [filters, setFilters] = useState<IntegrityFilters>({
    year: currentYear, severity: "all", issueType: "all", status: "open",
  });
  const { issues, snapshots } = useFinancialIntegrity(filters);
  const runMutation = useRunIntegrityCheck();

  const kpis = useMemo(() => computeKpis(issues.data ?? []), [issues.data]);
  const latestSnapshot = snapshots.data?.[0];
  const reconciliation = useMemo(() => {
    if (!latestSnapshot) return null;
    return reconcileTotal(latestSnapshot.total_received, latestSnapshot.total_expected);
  }, [latestSnapshot]);

  const fmt = (n: number) => {
    try { return formatCurrency(n); } catch { return n.toFixed(2); }
  };

  if (issues.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header / Run button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{t("integrity.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("integrity.subtitle")}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={String(filters.year)}
            onValueChange={(v) => setFilters((p) => ({ ...p, year: Number(v) }))}
          >
            <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="default"
            onClick={() => runMutation.mutate(filters.year)}
            disabled={runMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${runMutation.isPending ? "animate-spin" : ""}`} />
            {t("integrity.runCheck")}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t("integrity.kpi.open")} value={kpis.open} icon={<Activity className="h-4 w-4" />} tone="default" />
        <KpiCard label={t("integrity.kpi.critical")} value={kpis.critical} icon={<AlertTriangle className="h-4 w-4" />} tone="critical" />
        <KpiCard label={t("integrity.kpi.drift")} value={kpis.drift} icon={<GitCompareArrows className="h-4 w-4" />} tone="warning" />
        <KpiCard label={t("integrity.kpi.orphans")} value={kpis.orphan} icon={<FileWarning className="h-4 w-4" />} tone="warning" />
      </div>

      <Tabs defaultValue="issues" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="issues">{t("integrity.tabs.issues")}</TabsTrigger>
          <TabsTrigger value="reconciliation">{t("integrity.tabs.reconciliation")}</TabsTrigger>
          <TabsTrigger value="timeline">{t("integrity.tabs.timeline")}</TabsTrigger>
        </TabsList>

        {/* ISSUES */}
        <TabsContent value="issues" className="space-y-3">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center gap-2 flex-wrap">
              <CardTitle className="text-sm">{t("integrity.issues.title")}</CardTitle>
              <div className="ml-auto flex flex-wrap gap-2">
                <Select
                  value={filters.severity ?? "all"}
                  onValueChange={(v) => setFilters((p) => ({ ...p, severity: v as any }))}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("integrity.filter.allSeverities")}</SelectItem>
                    <SelectItem value="critical">{t("integrity.sev.critical")}</SelectItem>
                    <SelectItem value="warning">{t("integrity.sev.warning")}</SelectItem>
                    <SelectItem value="info">{t("integrity.sev.info")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={filters.issueType ?? "all"}
                  onValueChange={(v) => setFilters((p) => ({ ...p, issueType: v }))}
                >
                  <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("integrity.filter.allTypes")}</SelectItem>
                    {ISSUE_TYPES.map((it) => (
                      <SelectItem key={it} value={it}>{it}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filters.status ?? "open"}
                  onValueChange={(v) => setFilters((p) => ({ ...p, status: v as any }))}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("integrity.filter.allStatuses")}</SelectItem>
                    <SelectItem value="open">{t("integrity.status.open")}</SelectItem>
                    <SelectItem value="investigating">{t("integrity.status.investigating")}</SelectItem>
                    <SelectItem value="resolved">{t("integrity.status.resolved")}</SelectItem>
                    <SelectItem value="ignored">{t("integrity.status.ignored")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {(issues.data ?? []).length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {t("integrity.empty")}
                </div>
              ) : (
                <div className="rounded-md border border-border/50 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("integrity.col.detectedAt")}</TableHead>
                        <TableHead>{t("integrity.col.severity")}</TableHead>
                        <TableHead>{t("integrity.col.type")}</TableHead>
                        <TableHead>{t("integrity.col.entity")}</TableHead>
                        <TableHead>{t("integrity.col.status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(issues.data ?? []).map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(i.detected_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide ${severityBadgeBg(i.severity)}`}>
                              {i.severity}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">{i.issue_type}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {i.entity_type ?? "—"}
                            {i.entity_id && (
                              <span className="ml-1 font-mono">#{i.entity_id.slice(0, 8)}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{i.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* RECONCILIATION */}
        <TabsContent value="reconciliation" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t("integrity.reconciliation.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {!latestSnapshot ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {t("integrity.reconciliation.noSnapshot")}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SnapshotStat label={t("integrity.reconciliation.expected")} value={fmt(Number(latestSnapshot.total_expected))} />
                  <SnapshotStat label={t("integrity.reconciliation.received")} value={fmt(Number(latestSnapshot.total_received))} />
                  <SnapshotStat
                    label={t("integrity.reconciliation.difference")}
                    value={fmt(reconciliation?.difference ?? 0)}
                    tone={reconciliation?.status}
                  />
                  <SnapshotStat label={t("integrity.reconciliation.pending")} value={fmt(Number(latestSnapshot.total_pending))} />
                  <SnapshotStat label={t("integrity.reconciliation.distributed")} value={fmt(Number(latestSnapshot.total_distributed))} />
                  <SnapshotStat label={t("integrity.reconciliation.expenses")} value={fmt(Number(latestSnapshot.total_expenses))} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline" className="space-y-3">
          <IntegrityTimeline issues={issues.data ?? []} snapshots={snapshots.data ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "default" | "critical" | "warning" }) {
  const toneClass =
    tone === "critical" ? "text-destructive" :
    tone === "warning" ? "text-amber-500" :
    "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className={toneClass}>{icon}</span>
        </div>
        <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function SnapshotStat({ label, value, tone }: { label: string; value: string; tone?: "valid" | "warning" | "critical" }) {
  const toneClass =
    tone === "critical" ? "text-destructive" :
    tone === "warning" ? "text-amber-500" :
    tone === "valid" ? "text-emerald-500" :
    "text-foreground";
  return (
    <div className="rounded-lg border border-border/50 bg-card/50 p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
