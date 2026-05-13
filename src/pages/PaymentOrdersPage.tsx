import { useState, useCallback, useMemo, useEffect } from "react";
import { ChevronDown, ChevronRight, Wallet, ClipboardList } from "lucide-react";
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
import type { Json } from "@/integrations/supabase/types";
import { Can } from "@/components/Can";
import { getCurrentUser } from "@/lib/authUser";

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

  const [hCtx, setHCtx] = useState<HierarchyContext>(() =>
    loadHierarchyContext("hierarchy.payment_orders"),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("hierarchy.payment_orders.collapsed") === "1"; } catch { return false; }
  });
  const visibleOrders = useMemo(
    () => applyHierarchyContext(orders as any[], hCtx),
    [orders, hCtx],
  );

  const handleFiles = useCallback((files: File[]) => {
    const ctxDefaults = hierarchyDefaults(hCtx);
    const targetYear = hCtx.year ?? null;
    addFiles(files, async (file, onStatus) => {
      const storedDocument = await storeFileInDocuments(file, "payment_order", user?.id, "orders", targetYear).then((doc) => {
        queryClient.invalidateQueries({ queryKey: ["embedded-docs", "payment_order"] });
        return doc;
      });
      onStatus("uploading" as QueueItemStatus);
      await new Promise(r => setTimeout(r, 200));
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
          toast.warning("Low confidence — please review carefully.");
        }
      } catch (err) {
        const msg = (err as Error).message || "Unknown extraction error";
        toast.error(msg, { duration: 8000 });
        throw err;
      }
    });
  }, [addFiles, extract, user?.id, queryClient, hCtx]);

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
        platform: r.platform ?? null,
        list_name: r.list_name ?? ctxDefaults.week ?? null,
        operational_unit: ctxDefaults.operational_unit ?? null,
        car_name: r.car_name ?? null,
        license_plate: r.license_plate ? formatLicensePlate(r.license_plate) : null,
        services: (r.services || []) as unknown as Json,
        total: r.total ?? null,
        status: "pending",
        group_id: r.list_name ?? ctxDefaults.week ?? null,
      };
      // Phase 1E-X: respect active operational year context.
      if (hCtx.year && /^\d{4}$/.test(hCtx.year)) {
        const y = parseInt(hCtx.year, 10);
        const now = new Date();
        if (y !== now.getFullYear()) {
          const d = new Date(now);
          d.setFullYear(y);
          payload.created_at = d.toISOString();
        }
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

  return (
    <div className="animate-fade-in flex h-[calc(100vh-3.5rem)] w-full gap-3 p-3">
      {/* SIDEBAR OPERACIONAL */}
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
        />
      </aside>

      {/* CANVAS PRINCIPAL — premium card matching sidebar frame */}
      <div className="flex-1 min-w-0 flex flex-col rounded-lg border border-border/50 bg-card/40 backdrop-blur overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-foreground truncate">{t("po.title") || "Ordens de pagamento"}</h1>
              <p className="text-xs text-muted-foreground truncate">{t("po.subtitle") || "Validação e conciliação documental de pagamentos"}</p>
            </div>
          </div>
          <Can permission="payment_orders.create">
            <FileUploadZone onFilesSelected={handleFiles} isProcessing={isProcessing} compact />
          </Can>
        </header>

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

        <BottomCanvas hasExtractions={hasExtractions}>
          {hCtx.section === "documentos" ? (
            <div className="p-4">
              <EmbeddedFileManager entityType="payment_order" module="orders" defaultCollapsed={hasExtractions} />
            </div>
          ) : hCtx.section === "relatorios" ? (
            <SectionPlaceholder
              icon="chart"
              title="Relatórios"
              subtitle={hCtx.year ? `Ano ${hCtx.year}` : undefined}
              hint="Relatórios automáticos serão disponibilizados em breve."
            />
          ) : (
            <PaymentOrdersTable orders={visibleOrders as any} isLoading={isLoading} />
          )}
        </BottomCanvas>
      </div>
    </div>
  );
}

function BottomCanvas({ hasExtractions, children }: { hasExtractions: boolean; children: React.ReactNode }) {
  const [peek, setPeek] = useState(false);
  useEffect(() => { if (!hasExtractions) setPeek(false); }, [hasExtractions]);
  if (!hasExtractions) {
    return <div className="flex-1 min-h-0 overflow-auto">{children}</div>;
  }
  if (!peek) {
    return (
      <button
        type="button"
        onClick={() => setPeek(true)}
        className="flex w-full items-center gap-2 border-t border-border/40 bg-card/30 px-4 py-1.5 text-[11px] text-muted-foreground hover:bg-card/50 transition-colors"
        title="Mostrar tabela"
      >
        <ChevronRight className="h-3 w-3" />
        <span className="uppercase tracking-wide">Tabela operacional</span>
        <span className="ml-auto opacity-60">expandir</span>
      </button>
    );
  }
  return (
    <div className="flex flex-col min-h-0 border-t border-border/40">
      <button
        type="button"
        onClick={() => setPeek(false)}
        className="flex w-full items-center gap-2 bg-card/30 px-4 py-1.5 text-[11px] text-muted-foreground hover:bg-card/50 transition-colors shrink-0"
        title="Recolher tabela"
      >
        <ChevronDown className="h-3 w-3" />
        <span className="uppercase tracking-wide">Tabela operacional</span>
        
      </button>
      <div className="flex-1 min-h-0 overflow-auto max-h-[40vh]">{children}</div>
    </div>
  );
}
