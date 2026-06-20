import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, LayoutGrid, BarChart3, Wrench, FileText } from "lucide-react";
import { ProductionBoard } from "@/components/production/ProductionBoard";
import { TechnicianHub } from "@/components/production/TechnicianHub";
import { OperationalDashboard } from "@/components/production/OperationalDashboard";
import { DraftsPanel } from "@/components/production/DraftsPanel";
import { OrderDetailDialog } from "@/components/production/OrderDetailDialog";
import type { ProductionOrder } from "@/hooks/useProductionOrders";
import { useLanguage } from "@/hooks/useLanguage";
import { useServiceOrders } from "@/hooks/useServiceOrders";

const BLANK: ProductionOrder = {
  id: "__new__", workspace_id: "", code: "", client_id: null, client_name: null,
  technician_user_id: null, technician_name: null, platform: null, insurer: null,
  license_plate: null, vin: null, brand: null, model: null, color: null, notes: null,
  priority: "normal", status: "new_vehicle", due_at: null, started_at: null,
  finished_at: null, delivered_at: null, service_order_id: null, created_by: "",
  created_at: "", updated_at: "",
};

export const PRODUCTION_DRAFT_PREFIX = "production-draft-new-";

export default function ProductionPage() {
  const { t } = useLanguage();
  const [open, setOpen] = useState<ProductionOrder | null>(null);
  const [openDraftId, setOpenDraftId] = useState<string | undefined>(undefined);
  const [draftRefreshKey, setDraftRefreshKey] = useState(0);
  const { data: allOrders = [] } = useServiceOrders({});
  const draftCount = (allOrders as any[]).filter((o) => o.status === "draft").length;

  const handleDialogClose = () => {
    setOpen(null);
    setOpenDraftId(undefined);
    setDraftRefreshKey((k) => k + 1);
  };

  const handleResumeDraft = (draftId: string) => {
    try {
      const raw = localStorage.getItem(`${PRODUCTION_DRAFT_PREFIX}${draftId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setOpenDraftId(draftId);
          setOpen({ ...BLANK, ...parsed, id: "__new__" });
          return;
        }
      }
    } catch { /* ignore corrupt draft */ }
    setOpenDraftId(draftId);
    setOpen(BLANK);
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">{t("nav.production", "Produção")}</h1>
          <p className="text-sm text-muted-foreground">{t("production.subtitle", "Pipeline operacional de veículos em tempo real.")}</p>
        </div>
        <Button onClick={() => setOpen(BLANK)} className="h-11 w-full gap-2 sm:w-auto md:h-10">
          <Plus className="h-4 w-4" /> {t("production.newOrder", "Nova Ordem")}
        </Button>
      </div>

      <Tabs defaultValue="board" className="min-w-0 max-w-full">
        <TabsList className="grid h-auto w-full grid-cols-4 gap-1 p-1 md:inline-flex md:w-auto">
          <TabsTrigger value="board" className="min-h-10 gap-1.5 px-2 text-xs md:text-sm"><LayoutGrid className="h-4 w-4" /> <span className="truncate">{t("production.pipeline", "Pipeline")}</span></TabsTrigger>
          <TabsTrigger value="my" className="min-h-10 gap-1.5 px-2 text-xs md:text-sm"><Wrench className="h-4 w-4" /> <span className="truncate">{t("production.mine", "Minhas")}</span></TabsTrigger>
          <TabsTrigger value="dashboard" className="min-h-10 gap-1.5 px-2 text-xs md:text-sm"><BarChart3 className="h-4 w-4" /> <span className="truncate">{t("nav.dashboard", "Painel")}</span></TabsTrigger>
          <TabsTrigger value="drafts" className="relative min-h-10 gap-1.5 px-2 text-xs md:text-sm">
            <FileText className="h-4 w-4" />
            <span className="truncate">Rascunhos</span>
            {draftCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {draftCount > 99 ? "99+" : draftCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="board" className="mt-4">
          <ProductionBoard onOpen={setOpen} />
        </TabsContent>
        <TabsContent value="my" className="mt-4">
          <TechnicianHub />
        </TabsContent>
        <TabsContent value="dashboard" className="mt-4">
          <OperationalDashboard />
        </TabsContent>
        <TabsContent value="drafts" className="mt-4">
          <DraftsPanel
            refreshKey={draftRefreshKey}
            onResumeProductionDraft={handleResumeDraft}
          />
        </TabsContent>
      </Tabs>

      <OrderDetailDialog order={open} draftId={openDraftId} onClose={handleDialogClose} />
    </div>
  );
}
