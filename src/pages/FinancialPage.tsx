import { useState } from "react";
import { RefreshCw, BarChart3, Bell, UserPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/hooks/useLanguage";
import { useReconciliationSummary, useRunReconciliation } from "@/hooks/useReconciliation";
import { useConfrontoPending } from "@/hooks/useConfrontoOSOP";
import FusaoManualTab from "@/components/confronto/FusaoManualTab";
import PendentesTab from "@/components/confronto/PendentesTab";
import HistoricoTab from "@/components/confronto/HistoricoTab";
import OverviewTab from "@/components/financial/OverviewTab";
import TechnicianDetailTab from "@/components/financial/TechnicianDetailTab";
import { Link2 } from "lucide-react";
import { AlertTriangle } from "lucide-react";

export default function FinancialPage() {
  const { t } = useLanguage();
  const { data: summary, isLoading: summaryLoading } = useReconciliationSummary();
  const { data: pendingItems = [] } = useConfrontoPending();
  const runMutation = useRunReconciliation();
  const [confrontoTab, setConfrontoTab] = useState("fusao");
  const [mainTab, setMainTab] = useState("overview");
  const [showAddTech, setShowAddTech] = useState(false);

  const isLoading = summaryLoading;
  const s = summary ?? {
    expectedRevenue: 0, receivedRevenue: 0, totalDifference: 0, discrepancyPct: 0,
    matched: 0, mismatched: 0, missing: 0, pending: 0, expenses: 0, profit: 0,
    monthly: [], byClient: [], byTechnician: [], byPlatform: [], alerts: [],
    serviceOrderCount: 0, paymentOrderCount: 0, activeDiscrepancies: 0,
  };

  const hasNoData = s.serviceOrderCount === 0 && s.paymentOrderCount === 0;
  const hasAlerts = pendingItems.length > 0;

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
      {/* Header — minimal */}
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
          {hasAlerts && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => { setMainTab("confronto"); setConfrontoTab("pendentes"); }}
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-destructive text-[9px] text-destructive-foreground px-1">
                    {pendingItems.length}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{pendingItems.length} divergência{pendingItems.length > 1 ? "s" : ""}</TooltipContent>
            </Tooltip>
          )}

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
            <TooltipContent>Adicionar técnico</TooltipContent>
          </Tooltip>

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

      {/* TABS — clean, no badges */}
      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="confronto">Confronto</TabsTrigger>
          <TabsTrigger value="breakdown">Detalhamento</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <OverviewTab summary={s} hasNoData={hasNoData} />
        </TabsContent>

        {/* CONFRONTO — UNTOUCHED */}
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

        <TabsContent value="breakdown" className="space-y-4">
          <TechnicianDetailTab showAddModal={showAddTech} onShowAddModal={setShowAddTech} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
