import { useState, useCallback, useMemo } from "react";
import { Wallet, ClipboardList, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  HierarchyExplorer,
  applyHierarchyContext,
  loadHierarchyContext,
  type HierarchyContext,
} from "@/components/shared/HierarchyExplorer";
import { hierarchyDefaults } from "@/components/shared/HierarchyBreadcrumb";
import { FileUploadZone } from "@/components/service-orders/FileUploadZone";
import { ExtractedPaymentTable } from "@/components/payment-orders/ExtractedPaymentTable";
import { PaymentOrdersTable } from "@/components/payment-orders/PaymentOrdersTable";
import { EmbeddedFileManager, persistDocumentVisualState, storeFileInDocuments } from "@/components/file-manager/EmbeddedFileManager";
import { SectionPlaceholder } from "@/components/shared/SectionPlaceholder";
import { ActiveDocumentBand } from "@/components/shared/ActiveDocumentBand";
import { formatLicensePlate } from "@/lib/formatPlate";
import { fileForCurrentVisualState, type DocumentVisualState } from "@/lib/documentVisualState";
import {
  usePaymentOrders,
  useExtractPaymentOrder,
  type ExtractedPaymentOrder,
  type PaymentExtractionResult,
  type PaymentOrderInsert,
} from "@/hooks/usePaymentOrders";
import { useClients } from "@/hooks/useServiceOrders";
import { useAssignableUsers, useMyAssignableUserId } from "@/hooks/useAssignableUsers";
import { useFileQueue, type QueueItemStatus } from "@/hooks/useFileQueue";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Can } from "@/components/Can";
import { getCurrentUser } from "@/lib/authUser";
import { apiRequest } from "@/lib/api";
import { useContextualWorkspace } from "@/hooks/useContextualWorkspace";
import { ContextualWorkspacePicker } from "@/components/workspace/ContextualWorkspacePicker";

export default function PaymentOrdersPage() {
  const { t, formatCurrency } = useLanguage();
  const { user } = useAuth();
  const { isAdmin, dbRole } = useRole();
  const canAssignAnyTechnician = isAdmin || dbRole === "partner";
  const queryClient = useQueryClient();

  const [extractions, setExtractions] = useState<(PaymentExtractionResult & { _id: string; _file?: File; _documentId?: string; _docState: DocumentVisualState; _ocrVersion: number })[]>([]);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const { data: orders = [], isLoading, saveMutation } = usePaymentOrders({});
  const { extract } = useExtractPaymentOrder();
  const { data: clients = [] } = useClients();
  const { data: technicians = [] } = useAssignableUsers();
  const { data: myAssignableUserId } = useMyAssignableUserId();
  const { isProcessing, addFiles } = useFileQueue();
  const ctxWs = useContextualWorkspace("payment_orders");

  const [hCtx, setHCtx] = useState<HierarchyContext>(() =>
    loadHierarchyContext("hierarchy.payment_orders"),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("hierarchy.payment_orders.collapsed") === "1"; } catch { return false; }
  });
  const [treeOpen, setTreeOpen] = useState(false);
  const handleHierarchyContextChange = (ctx: HierarchyContext) => {
    setHCtx(ctx);
    setTreeOpen(false);
  };
  const visibleOrders = useMemo(
    () => applyHierarchyContext(orders as any[], hCtx),
    [orders, hCtx],
  );

  const handleFiles = useCallback((files: File[]) => {
    const ctxDefaults = hierarchyDefaults(hCtx);
    const targetYear = hCtx.year ?? null;
    addFiles(files, async (file, onStatus) => {
      onStatus("uploading" as QueueItemStatus);
      const storedDocument = await storeFileInDocuments(file, "payment_order", user?.id, "orders", targetYear);
      queryClient.invalidateQueries({ queryKey: ["embedded-docs", "payment_order"] });
      onStatus("processing" as QueueItemStatus);
      try {
        const result = await extract(file);
        const prefilled = {
          ...result,
          orders: result.orders.map((o) => ({
            ...o,
            client: o.client ?? ctxDefaults.client,
            list_name: o.list_name ?? ctxDefaults.week,
            technician: o.technician ?? ctxDefaults.technician,
          })),
        };
        setExtractions(prev => [...prev, {
          ...prefilled,
          _id: crypto.randomUUID(),
          _file: file,
          _documentId: storedDocument?.id,
          _docState: { displayName: file.name, rotation: 0, zoom: 1, validated: false, updatedAt: new Date().toISOString() },
          _ocrVersion: 0,
        }]);
        if (result.confidence === "low") {
          toast.warning(t("paymentOrders.lowConfidence", "Extração com baixa confiança. Revise com atenção."));
        }
      } catch (err) {
        const msg = (err as Error).message || t("paymentOrders.extractUnknown", "Erro desconhecido na extração.");
        toast.error(msg, { duration: 8000 });
        throw err;
      }
    });
  }, [addFiles, extract, user?.id, queryClient, hCtx, t]);

  const handleSave = async (extractionId: string, rows: ExtractedPaymentOrder[]) => {
    const extraction = extractions.find((e) => e._id === extractionId);
    const authUser = await getCurrentUser();
    if (!authUser?.id) {
      toast.error("Sessão expirada. Faça login novamente antes de salvar.", { duration: 7000 });
      return;
    }
    const ctxDefaults = hierarchyDefaults(hCtx);
    const inserts: PaymentOrderInsert[] = rows.map(r => {
      const clientMatch = clients.find(c => c.name.toLowerCase() === r.client?.toLowerCase());
      const rawTech = (r.technician ?? "").trim();
      const techByUser = technicians.find(t => t.user_id === rawTech);
      const techByName = !techByUser
        ? technicians.find(t => t.name.toLowerCase() === rawTech.toLowerCase())
        : undefined;
      const techMatch = techByUser ?? techByName;
      const finalUserId = canAssignAnyTechnician
        ? techMatch?.user_id ?? authUser.id
        : authUser.id;
      const selectedUser = technicians.find(t => t.user_id === finalUserId) ?? techMatch ?? null;
      const payload: Record<string, any> = {
        user_id: finalUserId,
        assigned_user_id: finalUserId,
        client_id: clientMatch?.id || null,
        client_name: r.client?.trim() || clientMatch?.name || ctxDefaults.client || null,
        technician_name: selectedUser?.name || techMatch?.name || rawTech || ctxDefaults.technician || null,
        platform: r.platform ?? ctxDefaults.platform ?? null,
        list_name: r.list_name ?? ctxDefaults.week ?? null,
        operational_unit: ctxDefaults.operational_unit ?? null,
        car_name: r.car_name ?? null,
        license_plate: r.license_plate ? formatLicensePlate(r.license_plate) : null,
        services: (r.services || []) as unknown as any,
        total: r.total ?? null,
        status: "pending",
        group_id: r.list_name ?? ctxDefaults.week ?? null,
        ...(ctxWs.resolvedWorkspaceId ? { workspace_id: ctxWs.resolvedWorkspaceId } : {}),
      };
      // Contexto operacional SEMPRE prevalece sobre o ano atual.
      if (ctxDefaults.year) {
        const y = parseInt(ctxDefaults.year, 10);
        const d = new Date();
        d.setFullYear(y);
        payload.created_at = d.toISOString();
      }
      return payload as PaymentOrderInsert;
    });

    saveMutation.mutate(inserts, {
      onSuccess: async () => {
        if (extraction?._documentId) {
          await persistDocumentVisualState(extraction._documentId, extraction._docState, true);
          queryClient.invalidateQueries({ queryKey: ["embedded-docs", "payment_order"] });
        }
        setExtractions(prev => prev.filter((e) => e._id !== extractionId));
      },
    });
  };

  const handleDiscard = (extractionId: string) => {
    setExtractions(prev => prev.filter((e) => e._id !== extractionId));
  };

  const updateDocumentState = async (extractionId: string, state: DocumentVisualState) => {
    setExtractions(prev => prev.map((e) => e._id === extractionId ? { ...e, _docState: state } : e));
    const extraction = extractions.find((e) => e._id === extractionId);
    if (extraction?._documentId) {
      await persistDocumentVisualState(extraction._documentId, state, false);
      queryClient.invalidateQueries({ queryKey: ["embedded-docs", "payment_order"] });
    }
  };

  const handleReprocessOcr = async (extractionId: string, state: DocumentVisualState) => {
    const extraction = extractions.find((e) => e._id === extractionId);
    if (!extraction?._file) return;
    setReprocessingId(extractionId);
    try {
      await updateDocumentState(extractionId, state);
      const visualFile = await fileForCurrentVisualState(extraction._file, state);
      const result = await extract(visualFile);
      const ctxDefaults = hierarchyDefaults(hCtx);
      const prefilled = {
        ...result,
        orders: result.orders.map((o) => ({
          ...o,
          client: o.client ?? ctxDefaults.client,
          list_name: o.list_name ?? ctxDefaults.week,
          technician: o.technician ?? ctxDefaults.technician,
        })),
      };
      setExtractions(prev => prev.map((e) => e._id === extractionId ? { ...e, ...prefilled, _docState: state, _ocrVersion: e._ocrVersion + 1 } : e));
      toast.success("OCR reprocessado com a orientação atual.");
    } catch (err) {
      toast.error((err as Error).message || "Erro ao reprocessar OCR.", { duration: 8000 });
    } finally {
      setReprocessingId(null);
    }
  };

  const hasExtractions = extractions.length > 0;

  const handleDeleteYear = useCallback(async (year: string) => {
    const y = parseInt(year, 10);
    if (!Number.isFinite(y)) return;
    try {
      const params = new URLSearchParams({ year: String(y) });
      if (ctxWs.resolvedWorkspaceId) params.set("workspace_id", ctxWs.resolvedWorkspaceId);
      await apiRequest(`/payment-orders?${params.toString()}`, { method: "DELETE" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payment_orders"] }),
        queryClient.invalidateQueries({ queryKey: ["embedded-docs", "payment_order"] }),
      ]);
      toast.success(`Operacional de ${year} excluído.`);
    } catch (err) {
      toast.error(`Erro ao excluir ${year}: ${(err as Error).message}`, { duration: 8000 });
      throw err;
    }
  }, [queryClient, ctxWs.resolvedWorkspaceId]);

  return (
    <div className="animate-fade-in flex min-h-full w-full min-w-0 flex-col gap-3 overflow-visible md:gap-2">
      {/* HEADER — sits ABOVE the operational tree, full width */}
      <header className="sticky top-0 z-30 -mx-3 flex shrink-0 flex-col gap-3 border-b border-border/40 bg-background/95 px-3 pb-3 pt-1 backdrop-blur sm:-mx-4 sm:px-4 md:static md:mx-0 md:flex-row md:items-center md:justify-between md:bg-transparent md:px-1 md:pb-2 md:pt-0 md:backdrop-blur-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">LISTA</h1>
            <p className="text-[11px] text-muted-foreground truncate">{t("po.subtitle") || "Registro de veículos validados e prontos para pagamento"}</p>
          </div>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 md:flex md:items-center">
          <Button variant="outline" size="icon" className="h-11 w-11 md:hidden" onClick={() => setTreeOpen(true)} aria-label="Abrir contexto operacional">
            <FolderTree className="h-4 w-4" />
          </Button>
          <ContextualWorkspacePicker ctx={ctxWs} />
          <Can permission="payment_orders.create">
            <FileUploadZone onFilesSelected={handleFiles} isProcessing={isProcessing} compact />
          </Can>
        </div>
      </header>

      <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
        <SheetContent side="left" className="w-[min(22rem,calc(100vw-1rem))] p-0">
          <HierarchyExplorer
            records={orders as any}
            storageKey="hierarchy.payment_orders"
            context={hCtx}
            onContextChange={handleHierarchyContextChange}
            weekIcon={ClipboardList}
            onDeleteYear={handleDeleteYear}
            defaultAllCollapsed
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-0 w-full flex-1 gap-3 overflow-visible md:overflow-hidden">
        <aside
          className={`hidden md:flex shrink-0 transition-[width] duration-200 ${sidebarCollapsed ? "w-12" : "w-56"}`}
        >
          <HierarchyExplorer
            records={orders as any}
            storageKey="hierarchy.payment_orders"
            context={hCtx}
            onContextChange={setHCtx}
            collapsible
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
            weekIcon={ClipboardList}
            onDeleteYear={handleDeleteYear}
            defaultAllCollapsed
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-visible md:overflow-auto">
          {hasExtractions && extractions.map((extraction) => (
            <ActiveDocumentBand
              key={extraction._id}
              file={extraction._file}
              stage="review"
              initialState={extraction._docState}
              onStateChange={(state) => setExtractions(prev => prev.map((e) => e._id === extraction._id ? { ...e, _docState: state } : e))}
              onPersistState={(state) => updateDocumentState(extraction._id, state)}
              onReprocessOcr={(state) => handleReprocessOcr(extraction._id, state)}
              isReprocessing={reprocessingId === extraction._id}
              onClose={() => handleDiscard(extraction._id)}
            >
              <ExtractedPaymentTable
                key={`${extraction._id}:${extraction._ocrVersion}`}
                orders={extraction.orders}
                confidence={extraction.confidence}
                notes={extraction.notes}
                onSave={(rows) => handleSave(extraction._id, rows)}
                onDiscard={() => handleDiscard(extraction._id)}
                isSaving={saveMutation.isPending}
                technicians={technicians}
                isTechnicianRole={dbRole === "technician"}
                isAdmin={canAssignAnyTechnician}
                myTechnicianName={
                  myAssignableUserId
                    ? technicians.find((t) => t.user_id === myAssignableUserId)?.name ?? null
                    : null
                }
              />
            </ActiveDocumentBand>
          ))}

          {!hasExtractions && (
            hCtx.section === "documentos" ? (
              <EmbeddedFileManager entityType="payment_order" module="orders" year={hCtx.year ?? null} />
            ) : hCtx.section === "relatorios" ? (
              <SectionPlaceholder
                icon="chart"
                title="Relatórios"
                subtitle={hCtx.year ? `Ano ${hCtx.year}` : undefined}
                hint="Relatórios automáticos serão disponibilizados em breve."
              />
            ) : (
              <PaymentOrdersTable orders={visibleOrders as any} isLoading={isLoading} />
            )
          )}
        </div>
      </div>
    </div>
  );
}
