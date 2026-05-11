import { useState, useCallback, useMemo } from "react";
import { CreditCard, Filter } from "lucide-react";
import {
  HierarchyExplorer,
  applyHierarchyContext,
  loadHierarchyContext,
  type HierarchyContext,
} from "@/components/shared/HierarchyExplorer";
import { HierarchyBreadcrumb, hierarchyDefaults } from "@/components/shared/HierarchyBreadcrumb";
import { HierarchicalOrdersView } from "@/components/shared/HierarchicalOrdersView";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileUploadZone } from "@/components/service-orders/FileUploadZone";
import { ExtractedPaymentTable } from "@/components/payment-orders/ExtractedPaymentTable";
import { ExtractionStages } from "@/components/service-orders/ExtractionStages";
import { UploadQueue } from "@/components/service-orders/UploadQueue";
import { PaymentOrdersTable } from "@/components/payment-orders/PaymentOrdersTable";
import { EmbeddedFileManager, storeFileInDocuments } from "@/components/file-manager/EmbeddedFileManager";
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
  const [filters, setFilters] = useState<{
    client_id?: string;
    platform?: string;
    assigned_user_id?: string;
    list_name?: string;
  }>({});

  const [extractions, setExtractions] = useState<(PaymentExtractionResult & { _id: string })[]>([]);
  const [sessionFiles, setSessionFiles] = useState<string[]>([]);
  const { data: orders = [], isLoading, saveMutation } = usePaymentOrders(filters);
  const { extract } = useExtractPaymentOrder();
  const { data: clients = [] } = useClients();
  const { data: technicians = [] } = useAssignableUsers();
  const { data: myAssignableUserId } = useMyAssignableUserId();
  
  const { queue, isProcessing, addFiles, clearCompleted } = useFileQueue();

  // Hierarchical view context (Phase 1A)
  const [hCtx, setHCtx] = useState<HierarchyContext>(() =>
    loadHierarchyContext("hierarchy.payment_orders"),
  );
  const visibleOrders = useMemo(
    () => applyHierarchyContext(orders as any[], hCtx),
    [orders, hCtx],
  );

  const platforms = [...new Set((orders as any[]).map(o => o.platform).filter(Boolean))];
  const listNames = [...new Set((orders as any[]).map(o => o.list_name).filter(Boolean))];

  const handleFiles = useCallback((files: File[]) => {
    setSessionFiles(prev => [...prev, ...files.map(f => f.name)]);
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
        // Phase 1C — pre-fill missing fields from active hierarchy context.
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
        console.error("[PaymentOrders] File processing failed:", msg);
        toast.error(msg, { duration: 8000 });
        throw err;
      }
    });
  }, [addFiles, extract, user?.id, queryClient, hCtx]);

  const handleSave = async (extractionId: string, rows: ExtractedPaymentOrder[]) => {
    // rows = EXACTLY what the user sees in the edited table (source of truth)
    console.log("SAVING DATA (raw edited rows):", JSON.stringify(rows, null, 2));
    const authUser = await getCurrentUser();
    console.log("AUTH USER:", authUser);
    if (!authUser?.id) {
      toast.error("Sessão expirada. Faça login novamente antes de salvar.", { duration: 7000 });
      return;
    }

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
      console.log("SELECTED TECHNICIAN:", selectedUser);
      const payload: Record<string, any> = {
        user_id: finalUserId,
        assigned_user_id: finalUserId,
        client_id: clientMatch?.id || null,
        client_name: r.client?.trim() || clientMatch?.name || null,
        technician_name: selectedUser?.name || techMatch?.name || rawTech || null,
        platform: r.platform ?? null,
        list_name: r.list_name ?? null,
        car_name: r.car_name ?? null,
        license_plate: r.license_plate ? formatLicensePlate(r.license_plate) : null,
        services: (r.services || []) as unknown as Json,
        total: r.total ?? null,
        status: "pending",
        group_id: r.list_name ?? null,
      };
      console.log("FINAL user_id:", payload.user_id);
      console.log("FINAL INSERT PAYLOAD:", payload);
      return payload as PaymentOrderInsert;
    });

    console.log("SAVING DATA (mapped inserts):", JSON.stringify(inserts, null, 2));

    saveMutation.mutate(inserts, {
      onSuccess: (response) => {
        console.log("INSERT RESPONSE:", response);
        console.log("INSERT ERROR:", null);
        setExtractions(prev => prev.filter((e) => e._id !== extractionId));
        
      },
      onError: (error) => {
        console.log("INSERT RESPONSE:", null);
        console.log("INSERT ERROR:", error);
      },
    });
  };

  const handleDiscard = (extractionId: string) => {
    setExtractions(prev => prev.filter((e) => e._id !== extractionId));
  };

  const setFilter = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value === "all" ? undefined : value }));
  };

  return (
    <div className="animate-fade-in flex gap-4">
      <div className="hidden md:block w-64 shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)]">
        <HierarchyExplorer
          records={orders as any}
          storageKey="hierarchy.payment_orders"
          context={hCtx}
          onContextChange={setHCtx}
          title={t("po.title")}
        />
      </div>

      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">{t("po.title")}</h1>
              <p className="text-xs text-muted-foreground">{t("po.subtitle")}</p>
            </div>
          </div>
        </div>

        {extractions.length === 0 && <ExtractionStages current="upload" />}

        <Can permission="payment_orders.create">
          <FileUploadZone onFilesSelected={handleFiles} isProcessing={isProcessing} />
        </Can>

        <UploadQueue queue={queue} onClearCompleted={clearCompleted} />

        <EmbeddedFileManager entityType="payment_order" sessionFileNames={sessionFiles} />

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

        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filters.client_id || "all"} onValueChange={v => setFilter("client_id", v)}>
            <SelectTrigger className="w-[160px] h-9 text-xs bg-secondary/30"><SelectValue placeholder={t("label.allClients")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("label.allClients")}</SelectItem>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.platform || "all"} onValueChange={v => setFilter("platform", v)}>
            <SelectTrigger className="w-[140px] h-9 text-xs bg-secondary/30"><SelectValue placeholder={t("label.allPlatforms")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("label.allPlatforms")}</SelectItem>
              {platforms.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.assigned_user_id || "all"} onValueChange={v => setFilter("assigned_user_id", v)}>
            <SelectTrigger className="w-[160px] h-9 text-xs bg-secondary/30"><SelectValue placeholder={t("label.allTechnicians")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("label.allTechnicians")}</SelectItem>
              {technicians.map(t_ => <SelectItem key={t_.user_id} value={t_.user_id}>{t_.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.list_name || "all"} onValueChange={v => setFilter("list_name", v)}>
            <SelectTrigger className="w-[140px] h-9 text-xs bg-secondary/30"><SelectValue placeholder={t("label.allLists")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("label.allLists")}</SelectItem>
              {listNames.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <HierarchicalOrdersView
          records={visibleOrders as any}
          storageKey="hierarchy.payment_orders"
          formatCurrency={formatCurrency}
          activeContext={hCtx}
          onView={setHCtx}
          renderLeaf={(subset) => (
            <PaymentOrdersTable orders={subset as any} isLoading={isLoading} />
          )}
        />
        {visibleOrders.length === 0 && (
          <PaymentOrdersTable orders={[] as any} isLoading={isLoading} />
        )}
      </div>
    </div>
  );
}
