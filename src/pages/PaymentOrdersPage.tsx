import { useState, useCallback, useRef } from "react";
import { CreditCard, Filter, RefreshCw } from "lucide-react";
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
  useDiscrepancyDetection,
  type ExtractedPaymentOrder,
  type PaymentExtractionResult,
  type PaymentOrderInsert,
} from "@/hooks/usePaymentOrders";
import { useClients, useTechnicians } from "@/hooks/useServiceOrders";
import { useFileQueue, type QueueItemStatus } from "@/hooks/useFileQueue";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Json } from "@/integrations/supabase/types";

export default function PaymentOrdersPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<{
    client_id?: string;
    platform?: string;
    technician_id?: string;
    list_name?: string;
  }>({});

  const [extractions, setExtractions] = useState<(PaymentExtractionResult & { _id: string })[]>([]);
  const [sessionFiles, setSessionFiles] = useState<string[]>([]);
  const { data: orders = [], isLoading, saveMutation } = usePaymentOrders(filters);
  const { extract } = useExtractPaymentOrder();
  const { data: clients = [] } = useClients();
  const { data: technicians = [] } = useTechnicians();
  const detectMutation = useDiscrepancyDetection();
  const { queue, isProcessing, addFiles, clearCompleted } = useFileQueue();

  const platforms = [...new Set((orders as any[]).map(o => o.platform).filter(Boolean))];
  const listNames = [...new Set((orders as any[]).map(o => o.list_name).filter(Boolean))];

  const handleFiles = useCallback((files: File[]) => {
    setSessionFiles(prev => [...prev, ...files.map(f => f.name)]);

    addFiles(files, async (file, onStatus) => {
      storeFileInDocuments(file, "payment_order", user?.id).then(() => {
        queryClient.invalidateQueries({ queryKey: ["embedded-docs", "payment_order"] });
      });

      onStatus("uploading" as QueueItemStatus);
      await new Promise(r => setTimeout(r, 200));
      onStatus("processing" as QueueItemStatus);
      try {
        const result = await extract(file);
        setExtractions(prev => [...prev, { ...result, _id: crypto.randomUUID() }]);
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
  }, [addFiles, extract, user?.id, queryClient]);

  const handleSave = (extractionId: string, rows: ExtractedPaymentOrder[]) => {
    // rows = EXACTLY what the user sees in the edited table (source of truth)
    console.log("SAVING DATA (raw edited rows):", JSON.stringify(rows, null, 2));

    const inserts: PaymentOrderInsert[] = rows.map(r => {
      const clientMatch = clients.find(c => c.name.toLowerCase() === r.client?.toLowerCase());
      const techMatch = technicians.find(t => t.name.toLowerCase() === r.technician?.toLowerCase());
      const payload: Record<string, any> = {
        client_id: clientMatch?.id || null,
        client_name: r.client?.trim() || clientMatch?.name || null,
        technician_id: techMatch?.id || null,
        technician_name: r.technician?.trim() || techMatch?.name || null,
        platform: r.platform ?? null,
        list_name: r.list_name ?? null,
        car_name: r.car_name ?? null,
        license_plate: r.license_plate ? formatLicensePlate(r.license_plate) : null,
        services: (r.services || []) as unknown as Json,
        total: r.total ?? null,
        status: "pending",
      };
      return payload as PaymentOrderInsert;
    });

    console.log("SAVING DATA (mapped inserts):", JSON.stringify(inserts, null, 2));

    saveMutation.mutate(inserts, {
      onSuccess: () => {
        setExtractions(prev => prev.filter((e) => e._id !== extractionId));
        detectMutation.mutate();
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
    <div className="space-y-6 animate-fade-in">
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => detectMutation.mutate()}
          disabled={detectMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${detectMutation.isPending ? "animate-spin" : ""}`} />
          {t("po.runDetection")}
        </Button>
      </div>

      {extractions.length === 0 && <ExtractionStages current="upload" />}

      <FileUploadZone onFilesSelected={handleFiles} isProcessing={isProcessing} />

      <UploadQueue queue={queue} onClearCompleted={clearCompleted} />

      {/* Embedded file manager */}
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

        <Select value={filters.technician_id || "all"} onValueChange={v => setFilter("technician_id", v)}>
          <SelectTrigger className="w-[160px] h-9 text-xs bg-secondary/30"><SelectValue placeholder={t("label.allTechnicians")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("label.allTechnicians")}</SelectItem>
            {technicians.map(t_ => <SelectItem key={t_.id} value={t_.id}>{t_.name}</SelectItem>)}
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

      <PaymentOrdersTable orders={orders as any} isLoading={isLoading} />
    </div>
  );
}
