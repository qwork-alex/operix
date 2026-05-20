import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw, BarChart3, Bell, UserPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/hooks/useLanguage";
import { useReconciliationSummary, useRunReconciliation } from "@/hooks/useReconciliation";
import { useConfrontoPending } from "@/hooks/useConfrontoOSOP";
import { useNotifications } from "@/hooks/useNotifications";
import { useParticipantAggregation } from "@/hooks/useParticipantAggregation";
import FusaoManualTab from "@/components/confronto/FusaoManualTab";
import PendentesTab from "@/components/confronto/PendentesTab";
import HistoricoTab from "@/components/confronto/HistoricoTab";

import TechnicianDetailTab from "@/components/financial/TechnicianDetailTab";
import ParticipationTab from "@/components/financial/ParticipationTab";
import FinancialAuditTab from "@/components/financial/FinancialAuditTab";
import { AccountingControlCenter } from "@/components/accounting/AccountingControlCenter";
import { Link2, AlertTriangle, Users, ShieldCheck, BookOpen } from "lucide-react";

export default function FinancialPage() {
  const { t } = useLanguage();
  const { data: summary, isLoading: summaryLoading } = useReconciliationSummary();
  const { data: pendingItems = [] } = useConfrontoPending();
  const { notifications, markAsRead } = useNotifications();
  const { data: aggregation } = useParticipantAggregation();
  const runMutation = useRunReconciliation();
  const [confrontoTab, setConfrontoTab] = useState("fusao");
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const validTabs = ["confronto", "breakdown", "participation", "audit", "accounting"];
  const [mainTab, setMainTab] = useState(
    initialTab && validTabs.includes(initialTab) ? initialTab : "confronto"
  );
  const [showAddTech, setShowAddTech] = useState(false);

  // Financial alerts: unread discrepancy notifications
  const financialAlerts = notifications.filter(
    (n: any) => !n.is_read && n.type === "discrepancy"
  );
  const hasAlerts = financialAlerts.length > 0;

  const isLoading = summaryLoading;
  const baseSummary = summary ?? {
    expectedRevenue: 0, receivedRevenue: 0, totalDifference: 0, discrepancyPct: 0,
    matched: 0, mismatched: 0, missing: 0, pending: 0, expenses: 0, profit: 0,
    monthly: [], byClient: [], byTechnician: [], byPlatform: [], alerts: [],
    serviceOrderCount: 0, paymentOrderCount: 0, activeDiscrepancies: 0,
  };

  // HARD BIND: Financial UI is driven EXCLUSIVELY by the snapshot-based
  // aggregation engine. No fallback to legacy reconciliation totals.
  const expectedRevenue = aggregation?.totals.expected ?? 0;
  const receivedRevenue = aggregation?.totals.received ?? 0;
  const totalDifference = expectedRevenue - receivedRevenue;
  const discrepancyPct = expectedRevenue > 0
    ? Math.round((Math.abs(totalDifference) / expectedRevenue) * 1000) / 10
    : 0;
  const s = {
    ...baseSummary,
    expectedRevenue,
    receivedRevenue,
    totalDifference,
    discrepancyPct,
    profit: receivedRevenue - baseSummary.expenses,
  };

  const dbg = aggregation?.debug;
  const aggDisconnected = !!dbg && dbg.serviceOrdersUsed === 0 && dbg.serviceOrdersTotal > 0;
  const hasNoData = s.serviceOrderCount === 0 && s.paymentOrderCount === 0;

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

        {/* Icon-only actions */}
        <div className="flex items-center gap-1">
          {/* Confronto-only: Alert bell + Refresh */}
          {mainTab === "confronto" && (
            <>
              {hasAlerts && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive relative"
                    >
                      <Bell className="h-4 w-4" />
                      <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-destructive text-[9px] text-destructive-foreground px-1">
                        {financialAlerts.length}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    {financialAlerts.map((alert: any) => (
                      <DropdownMenuItem
                        key={alert.id}
                        className="cursor-pointer flex flex-col items-start gap-0.5 py-2"
                        onClick={() => {
                          markAsRead(alert.id);
                          setMainTab("confronto");
                          setConfrontoTab("pendentes");
                        }}
                      >
                        <span className="text-sm font-medium text-foreground">{alert.title}</span>
                        {alert.message && <span className="text-xs text-muted-foreground">{alert.message}</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => runMutation.mutate()}
                    disabled={runMutation.isPending}
                  >
                    <RefreshCw className={`h-4 w-4 ${runMutation.isPending ? "animate-spin" : ""}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("fin.refreshAnalysis")}</TooltipContent>
              </Tooltip>
            </>
          )}

          {/* Detalhamento-only: Add technician */}
          {mainTab === "breakdown" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowAddTech(true)}
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("fin.addTech")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Debug strip removed — Financial values are derived from the
          single source of truth (src/lib/distributionMath.ts). */}

      {/* No-data empty state */}
      {hasNoData && (
        <Card className="border-border/50 bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">{t("fin.empty.title")}</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {t("fin.empty.desc")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* TABS */}
      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="confronto">{t("fin.tabs.confronto")}</TabsTrigger>
          <TabsTrigger value="breakdown">{t("fin.tabs.breakdown")}</TabsTrigger>
          <TabsTrigger value="participation">
            <Users className="h-3.5 w-3.5 mr-1" /> {t("fin.tabs.participation")}
          </TabsTrigger>
          <TabsTrigger value="audit">
            <ShieldCheck className="h-3.5 w-3.5 mr-1" /> {t("fin.tabs.audit")}
          </TabsTrigger>
          <TabsTrigger value="accounting">
            <BookOpen className="h-3.5 w-3.5 mr-1" /> {t("fin.tabs.accounting")}
          </TabsTrigger>
        </TabsList>



        {/* CONFRONTO — UNTOUCHED */}
        <TabsContent value="confronto" className="space-y-4">
          <Tabs value={confrontoTab} onValueChange={setConfrontoTab}>
            <TabsList className="bg-muted/50">
              <TabsTrigger value="fusao">
                <Link2 className="h-3.5 w-3.5 mr-1" /> {t("fin.confronto.fusao")}
              </TabsTrigger>
              <TabsTrigger value="pendentes" className="relative">
                <AlertTriangle className="h-3.5 w-3.5 mr-1" /> {t("fin.confronto.pendentes")}
                {pendingItems.length > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive/20 text-destructive text-[9px] px-1">
                    {pendingItems.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="historico">{t("fin.confronto.historico")}</TabsTrigger>
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

        <TabsContent value="breakdown" className="space-y-4">
          <TechnicianDetailTab showAddModal={showAddTech} onShowAddModal={setShowAddTech} />
        </TabsContent>

        <TabsContent value="participation" className="space-y-4">
          <ParticipationTab />
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <FinancialAuditTab />
        </TabsContent>

        <TabsContent value="accounting" className="space-y-4">
          <div className="min-h-[600px]">
            <AccountingControlCenter embedded />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
