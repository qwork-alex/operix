import { useState, useCallback, useMemo } from "react";
import {
  HierarchyExplorer,
  applyHierarchyContext,
  loadHierarchyContext,
  type HierarchyContext,
} from "@/components/shared/HierarchyExplorer";
import { hierarchyDefaults } from "@/components/shared/HierarchyBreadcrumb";
import { FileUploadZone } from "@/components/service-orders/FileUploadZone";
import { ExtractedDataTable } from "@/components/service-orders/ExtractedDataTable";
import { ServiceOrdersTable } from "@/components/service-orders/ServiceOrdersTable";
import { EmbeddedFileManager, persistDocumentVisualState, storeFileInDocuments } from "@/components/file-manager/EmbeddedFileManager";
import { SectionPlaceholder } from "@/components/shared/SectionPlaceholder";
import { ActiveDocumentBand } from "@/components/shared/ActiveDocumentBand";
import { formatLicensePlate } from "@/lib/formatPlate";
import { fileForCurrentVisualState, type DocumentVisualState } from "@/lib/documentVisualState";
import {
  useServiceOrders,
  useExtractServiceOrder,
  useClients,
  type ExtractedOrder,
  type ExtractionResult,
  type ServiceOrderInsert,
} from "@/hooks/useServiceOrders";
import { useAssignableUsers, useMyAssignableUserId } from "@/hooks/useAssignableUsers";
import { useFileQueue, type QueueItemStatus } from "@/hooks/useFileQueue";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTechnicianEarnings, getTechEarnings } from "@/hooks/useTechnicianEarnings";
import { Can } from "@/components/Can";
import { getCurrentUser } from "@/lib/authUser";

export default function ServiceOrdersPage() {
  const { t, formatCurrency } = useLanguage();
  const { user } = useAuth();
  const { isAdmin, dbRole } = useRole();
  const canAssignAnyTechnician = isAdmin || dbRole === "partner";
  const isTechnicianRole = dbRole === "technician";
  const queryClient = useQueryClient();

  const [extractions, setExtractions] = useState<(ExtractionResult & { _id: string; _file?: File; _documentId?: string; _docState: DocumentVisualState; _ocrVersion: number })[]>([]);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const { data: orders = [], isLoading, saveMutation } = useServiceOrders({});
  const { extract } = useExtractServiceOrder();
  const { data: clients = [] } = useClients();
  const { data: technicians = [] } = useAssignableUsers();
  const { data: myAssignableUserId } = useMyAssignableUserId();
  const { data: earningsMap } = useTechnicianEarnings();
  const { isProcessing, addFiles } = useFileQueue();

  const [hCtx, setHCtx] = useState<HierarchyContext>(() =>
    loadHierarchyContext("hierarchy.service_orders"),
  );
  const visibleOrders = useMemo(
    () => applyHierarchyContext(orders as any[], hCtx),
    [orders, hCtx],
  );

  const handleFiles = useCallback((files: File[]) => {
    const ctxDefaults = hierarchyDefaults(hCtx);
    addFiles(files, async (file, onStatus) => {
      const storedDocument = await storeFileInDocuments(file, "service_order", user?.id).then((doc) => {
        queryClient.invalidateQueries({ queryKey: ["embedded-docs", "service_order"] });
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
            week: o.week ?? ctxDefaults.week,
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
          toast.warning("Low confidence extraction — please review carefully.");
        }
      } catch (err) {
        const msg = (err as Error).message || "Unknown extraction error";
        toast.error(msg, { duration: 8000 });
        throw err;
      }
    });
  }, [addFiles, extract, user?.id, queryClient, hCtx]);

  const handleSave = async (extractionId: string, rows: ExtractedOrder[]) => {
    const extraction = extractions.find((e) => e._id === extractionId);
    const authUser = await getCurrentUser();
    if (!authUser?.id) {
      toast.error("Sessão expirada. Faça login novamente antes de salvar.", { duration: 7000 });
      return;
    }
    const inserts: ServiceOrderInsert[] = [];
    const missingUserRows: number[] = [];
    rows.forEach((r, idx) => {
      const clientMatch = clients.find((c) => c.name.toLowerCase() === r.client?.toLowerCase());
      const rawTech = (r.technician ?? "").trim();
      const techByUser = technicians.find((t) => t.user_id === rawTech);
      const techByName = !techByUser
        ? technicians.find((t) => t.name.toLowerCase() === rawTech.toLowerCase())
        : undefined;
      const techMatch = techByUser ?? techByName;
      let technicianName: string = techMatch?.name ?? rawTech;
      if (!canAssignAnyTechnician) {
        const me = technicians.find((t) => t.user_id === authUser.id);
        if (me) technicianName = me.name;
      } else if (techByUser) {
        technicianName = techByUser.name;
      }
      const selectedUser = techByUser ?? techByName ?? null;
      const ctxDefaults = hierarchyDefaults(hCtx);
      const payload: Record<string, any> = {
        client_id: clientMatch?.id || null,
        client_name: r.client?.trim() || clientMatch?.name || "",
        technician_name: technicianName,
        technician_id: null,
        platform: r.platform ?? null,
        week: r.week ?? ctxDefaults.week ?? null,
        operational_unit: ctxDefaults.operational_unit ?? null,
        car_name: r.car_name ?? null,
        license_plate: r.license_plate ? formatLicensePlate(r.license_plate) : null,
        service_1_name: r.service_1_name ?? null,
        service_1_price: r.service_1_price ?? null,
        service_2_name: r.service_2_name ?? null,
        service_2_price: r.service_2_price ?? null,
        service_3_name: r.service_3_name ?? null,
        service_3_price: r.service_3_price ?? null,
        service_4_name: r.service_4_name ?? null,
        service_4_price: r.service_4_price ?? null,
        total: r.total ?? null,
        status: "draft",
        group_id: r.week ?? ctxDefaults.week ?? null,
      };
      const techName = payload.technician_name || r.technician;
      const techEarn = getTechEarnings(techName, payload.total, earningsMap);
      payload.technician_percentage = techEarn?.percentage ?? 0;
      payload.technician_earning = techEarn?.earnings ?? 0;
      let finalUserId: string = authUser.id;
      if (canAssignAnyTechnician) finalUserId = selectedUser?.user_id ?? "";
      if (!canAssignAnyTechnician && finalUserId !== authUser.id) {
        throw new Error("RLS violation prevention: invalid user_id");
      }
      if (!finalUserId) missingUserRows.push(idx + 1);
      payload.user_id = finalUserId;
      payload.assigned_user_id = finalUserId;
      inserts.push(payload as ServiceOrderInsert);
    });
    if (missingUserRows.length > 0) {
      const msg = isTechnicianRole
        ? "Sua conta não está autenticada. Faça login novamente antes de salvar."
        : `Selecione um usuário antes de salvar (linha(s): ${missingUserRows.join(", ")})`;
      toast.error(msg, { duration: 7000 });
      return;
    }
    saveMutation.mutate(inserts, {
      onSuccess: async () => {
        if (extraction?._documentId) {
          await persistDocumentVisualState(extraction._documentId, extraction._docState, true);
          queryClient.invalidateQueries({ queryKey: ["embedded-docs", "service_order"] });
        }
        setExtractions(prev => prev.filter((e) => e._id !== extractionId));
        toast.success(
          inserts.length === 1 ? "Ordem salva com sucesso" : `${inserts.length} ordens salvas com sucesso`,
          { duration: 4000 }
        );
      },
      onError: (err) => {
        const raw = (err as Error).message || "";
        toast.error(`Erro ao salvar.\n${raw}`, { duration: 8000 });
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
      queryClient.invalidateQueries({ queryKey: ["embedded-docs", "service_order"] });
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
          week: o.week ?? ctxDefaults.week,
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
    <div className="animate-fade-in flex h-[calc(100vh-3.5rem)] w-full">
      {/* SIDEBAR OPERACIONAL */}
      <aside className="hidden md:flex w-56 shrink-0 border-r border-border/40 bg-card/20">
        <HierarchyExplorer
          records={orders as any}
          storageKey="hierarchy.service_orders"
          context={hCtx}
          onContextChange={setHCtx}
        />
      </aside>

      {/* CANVAS PRINCIPAL — continuous, no cards */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* HEADER SUPERIOR */}
        <header className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-2">
          <h1 className="text-sm font-semibold text-foreground">{t("so.title") || "Ordens de serviço"}</h1>
          <Can permission="service_orders.create">
            <FileUploadZone onFilesSelected={handleFiles} isProcessing={isProcessing} compact />
          </Can>
        </header>

        {/* MESA DOCUMENTAL — vertical, contínua, dominante */}
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
            <ExtractedDataTable
              key={`${extraction._id}:${extraction._ocrVersion}`}
              orders={extraction.orders}
              confidence={extraction.confidence}
              notes={extraction.notes}
              onSave={(rows) => handleSave(extraction._id, rows)}
              onDiscard={() => handleDiscard(extraction._id)}
              isSaving={saveMutation.isPending}
              technicians={technicians}
              isTechnicianRole={isTechnicianRole}
              isAdmin={canAssignAnyTechnician}
              myTechnicianName={
                myAssignableUserId
                  ? technicians.find((t) => t.user_id === myAssignableUserId)?.name ?? null
                  : null
              }
            />
          </ActiveDocumentBand>
        ))}

        {/* CANVAS — driven by tree section */}
        <div className={`flex-1 min-h-0 overflow-auto ${hasExtractions ? "border-t border-border/40" : ""}`}>
          {hCtx.section === "documentos" ? (
            <div className="p-4">
              <EmbeddedFileManager entityType="service_order" module="orders" />
            </div>
          ) : hCtx.section === "relatorios" ? (
            <SectionPlaceholder
              icon="chart"
              title="Relatórios"
              subtitle={hCtx.year ? `Ano ${hCtx.year}` : undefined}
              hint="Relatórios automáticos serão disponibilizados em breve."
            />
          ) : (
            <ServiceOrdersTable orders={visibleOrders as any} isLoading={isLoading} />
          )}
        </div>
      </div>
    </div>
  );
}
