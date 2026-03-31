import { useState, useCallback } from "react";
import { CreditCard, Filter, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileUploadZone } from "@/components/service-orders/FileUploadZone";
import { ExtractedPaymentTable } from "@/components/payment-orders/ExtractedPaymentTable";
import { ExtractionStages } from "@/components/service-orders/ExtractionStages";
import { UploadQueue } from "@/components/service-orders/UploadQueue";
import { PaymentOrdersTable } from "@/components/payment-orders/PaymentOrdersTable";
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
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export default function PaymentOrdersPage() {
  const { t } = useLanguage();
  const [filters, setFilters] = useState<{
    client_id?: string;
    platform?: string;
    technician_id?: string;
    list_name?: string;
  }>({});

  const [extractions, setExtractions] = useState<PaymentExtractionResult[]>([]);
  const { data: orders = [], isLoading, saveMutation } = usePaymentOrders(filters);
  const { extract } = useExtractPaymentOrder();
  const { data: clients = [] } = useClients();
  const { data: technicians = [] } = useTechnicians();
  const detectMutation = useDiscrepancyDetection();
  const { queue, isProcessing, addFiles, clearCompleted } = useFileQueue();

  const platforms = [...new Set((orders as any[]).map(o => o.platform).filter(Boolean))];
  const listNames = [...new Set((orders as any[]).map(o => o.list_name).filter(Boolean))];

  const handleFiles = useCallback((files: File[]) => {
    addFiles(files, async (file, onStatus) => {
      onStatus("uploading" as QueueItemStatus);
      await new Promise(r => setTimeout(r, 200));
      onStatus("processing" as QueueItemStatus);
      try {
        const result = await extract(file);
        setExtractions(prev => [...prev, result]);
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
  }, [addFiles, extract]);

  const handleSave = (extractionIdx: number, rows: ExtractedPaymentOrder[]) => {
    const inserts: PaymentOrderInsert[] = rows.map(r => {
      const clientMatch = clients.find(c => c.name.toLowerCase() === r.client?.toLowerCase());
      const techMatch = technicians.find(t => t.name.toLowerCase() === r.technician?.toLowerCase());
      return {
        client_id: clientMatch?.id || null,
        technician_id: techMatch?.id || null,
        platform: r.platform,
        list_name: r.list_name,
        car_name: r.car_name,
        license_plate: r.license_plate,
        services: (r.services || []) as unknown as Json,
        total: r.total,
        status: "pending",
      };
    });

    saveMutation.mutate(inserts, {
      onSuccess: () => {
        setExtractions(prev => prev.filter((_, i) => i !== extractionIdx));
        detectMutation.mutate();
      },
    });
  };

  const handleDiscard = (extractionIdx: number) => {
    setExtractions(prev => prev.filter((_, i) => i !== extractionIdx));
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

      {extractions.map((extraction, idx) => (
        <ExtractedPaymentTable
          key={idx}
          orders={extraction.orders}
          confidence={extraction.confidence}
          notes={extraction.notes}
          onSave={(rows) => handleSave(idx, rows)}
          onDiscard={() => handleDiscard(idx)}
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
