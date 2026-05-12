import { useState, useCallback, useMemo } from "react";
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
import { storeFileInDocuments } from "@/components/file-manager/EmbeddedFileManager";
import { SectionPlaceholder } from "@/components/shared/SectionPlaceholder";
import { formatLicensePlate } from "@/lib/formatPlate";
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

  const [extractions, setExtractions] = useState<(PaymentExtractionResult & { _id: string })[]>([]);
  const { data: orders = [], isLoading, saveMutation } = usePaymentOrders({});
  const { extract } = useExtractPaymentOrder();
  const { data: clients = [] } = useClients();
  const { data: technicians = [] } = useAssignableUsers();
  const { data: myAssignableUserId } = useMyAssignableUserId();
  const { isProcessing, addFiles } = useFileQueue();

  const [hCtx, setHCtx] = useState<HierarchyContext>(() =>
    loadHierarchyContext("hierarchy.payment_orders"),
  );
  const visibleOrders = useMemo(
    () => applyHierarchyContext(orders as any[], hCtx),
    [orders, hCtx],
  );

  const handleFiles = useCallback((files: File[]) => {
    const ctxDefaults = hierarchyDefaults(hCtx);
    addFiles(files, async (file, onStatus) => {
      storeFileInDocuments(file, "payment_order", user?.id).then(() => {
        queryClient.invalidateQueries({ queryKey: ["embedded-docs", "payment_order"] });
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
        setExtractions(prev => [...prev, { ...prefilled, _id: crypto.randomUUID() }]);
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
      return payload as PaymentOrderInsert;
    });

    saveMutation.mutate(inserts, {
      onSuccess: () => {
        setExtractions(prev => prev.filter((e) => e._id !== extractionId));
      },
    });
  };

  const handleDiscard = (extractionId: string) => {
    setExtractions(prev => prev.filter((e) => e._id !== extractionId));
  };

  const hasExtractions = extractions.length > 0;

  return (
    <div className="animate-fade-in flex h-[calc(100vh-3.5rem)] w-full">
      {/* SIDEBAR OPERACIONAL */}
      <aside className="hidden md:flex w-56 shrink-0 border-r border-border/40 bg-card/20">
        <HierarchyExplorer
          records={orders as any}
          storageKey="hierarchy.payment_orders"
          context={hCtx}
          onContextChange={setHCtx}
        />
      </aside>

      {/* CANVAS PRINCIPAL */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-2">
          <h1 className="text-sm font-semibold text-foreground">{t("po.title") || "Ordens de pagamento"}</h1>
          <Can permission="payment_orders.create">
            <FileUploadZone onFilesSelected={handleFiles} isProcessing={isProcessing} compact />
          </Can>
        </header>

        {hasExtractions && (
          <div className="border-b border-border/40 px-2 py-2">
            {extractions.map((extraction) => (
              <ExtractedPaymentTable
                key={extraction._id}
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
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          {hCtx.section === "documentos" ? (
            <SectionPlaceholder
              icon="folder"
              title="Documentos"
              subtitle={hCtx.year ? `Ano ${hCtx.year}` : undefined}
              hint="Área de documentos será disponibilizada em breve."
            />
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
        </div>
      </div>
    </div>
  );
}
