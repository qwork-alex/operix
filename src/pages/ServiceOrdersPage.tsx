import { useState, useCallback, useRef } from "react";
import { FileText, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/service-orders/FileUploadZone";
import { ExtractedDataTable } from "@/components/service-orders/ExtractedDataTable";
import { ExtractionStages } from "@/components/service-orders/ExtractionStages";
import { UploadQueue } from "@/components/service-orders/UploadQueue";
import { ServiceOrdersTable } from "@/components/service-orders/ServiceOrdersTable";
import { EmbeddedFileManager, storeFileInDocuments } from "@/components/file-manager/EmbeddedFileManager";
import {
  useServiceOrders,
  useExtractServiceOrder,
  useClients,
  useTechnicians,
  type ExtractedOrder,
  type ExtractionResult,
  type ServiceOrderInsert,
} from "@/hooks/useServiceOrders";
import { useFileQueue, type QueueItemStatus } from "@/hooks/useFileQueue";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function ServiceOrdersPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<{
    client_id?: string;
    platform?: string;
    technician_id?: string;
    week?: string;
  }>({});

  const [extractions, setExtractions] = useState<(ExtractionResult & { _id: string })[]>([]);
  const [sessionFiles, setSessionFiles] = useState<string[]>([]);
  const { data: orders = [], isLoading, saveMutation } = useServiceOrders(filters);
  const { extract } = useExtractServiceOrder();
  const { data: clients = [] } = useClients();
  const { data: technicians = [] } = useTechnicians();
  const { queue, isProcessing, addFiles, clearCompleted } = useFileQueue();

  const platforms = [...new Set((orders as any[]).map((o) => o.platform).filter(Boolean))];
  const weeks = [...new Set((orders as any[]).map((o) => o.week).filter(Boolean))];

  const handleFiles = useCallback((files: File[]) => {
    // Track session files for filter
    setSessionFiles(prev => [...prev, ...files.map(f => f.name)]);

    addFiles(files, async (file, onStatus) => {
      // Store file in document system (non-blocking)
      storeFileInDocuments(file, "service_order", user?.id).then(() => {
        queryClient.invalidateQueries({ queryKey: ["embedded-docs", "service_order"] });
      });

      onStatus("uploading" as QueueItemStatus);
      await new Promise(r => setTimeout(r, 200));
      onStatus("processing" as QueueItemStatus);
      try {
        const result = await extract(file);
        setExtractions(prev => [...prev, { ...result, _id: crypto.randomUUID() }]);
        if (result.confidence === "low") {
          toast.warning("Low confidence extraction — please review carefully.");
        }
      } catch (err) {
        const msg = (err as Error).message || "Unknown extraction error";
        console.error("[ServiceOrders] File processing failed:", msg);
        toast.error(msg, { duration: 8000 });
        throw err;
      }
    });
  }, [addFiles, extract, user?.id, queryClient]);

  const handleSave = (extractionId: string, rows: ExtractedOrder[]) => {
    // rows = EXACTLY what the user sees in the edited table (source of truth)
    console.log("SAVING DATA (raw edited rows):", JSON.stringify(rows, null, 2));

    const inserts: ServiceOrderInsert[] = rows.map((r) => {
      const clientMatch = clients.find(
        (c) => c.name.toLowerCase() === r.client?.toLowerCase()
      );
      const techMatch = technicians.find(
        (t) => t.name.toLowerCase() === r.technician?.toLowerCase()
      );
      const payload: ServiceOrderInsert = {
        client_id: clientMatch?.id || null,
        technician_id: techMatch?.id || null,
        platform: r.platform ?? null,
        week: r.week ?? null,
        car_name: r.car_name ?? null,
        license_plate: r.license_plate ?? null,
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
      };
      return payload;
    });

    console.log("SAVING DATA (mapped inserts):", JSON.stringify(inserts, null, 2));

    saveMutation.mutate(inserts, {
      onSuccess: () => {
        setExtractions(prev => prev.filter((e) => e._id !== extractionId));
      },
    });
  };

  const handleDiscard = (extractionId: string) => {
    setExtractions(prev => prev.filter((e) => e._id !== extractionId));
  };

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value === "all" ? undefined : value,
    }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t("so.title")}</h1>
          <p className="text-xs text-muted-foreground">
            {t("so.subtitle")}
          </p>
        </div>
      </div>

      {/* Stage indicator */}
      {extractions.length === 0 && <ExtractionStages current="upload" />}

      {/* Upload */}
      <FileUploadZone onFilesSelected={handleFiles} isProcessing={isProcessing} />

      {/* Embedded file manager */}
      <EmbeddedFileManager entityType="service_order" sessionFileNames={sessionFiles} />

      {/* Extraction previews — one per file */}
      {extractions.map((extraction) => (
        <ExtractedDataTable
          key={extraction._id}
          orders={extraction.orders}
          confidence={extraction.confidence}
          notes={extraction.notes}
          onSave={(rows) => handleSave(extraction._id, rows)}
          onDiscard={() => handleDiscard(extraction._id)}
          isSaving={saveMutation.isPending}
        />
      ))}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filters.client_id || "all"} onValueChange={(v) => setFilter("client_id", v)}>
          <SelectTrigger className="w-[160px] h-9 text-xs bg-secondary/30">
            <SelectValue placeholder={t("label.allClients")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("label.allClients")}</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.platform || "all"} onValueChange={(v) => setFilter("platform", v)}>
          <SelectTrigger className="w-[140px] h-9 text-xs bg-secondary/30">
            <SelectValue placeholder={t("label.allPlatforms")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("label.allPlatforms")}</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.technician_id || "all"} onValueChange={(v) => setFilter("technician_id", v)}>
          <SelectTrigger className="w-[160px] h-9 text-xs bg-secondary/30">
            <SelectValue placeholder={t("label.allTechnicians")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("label.allTechnicians")}</SelectItem>
            {technicians.map((t_) => (
              <SelectItem key={t_.id} value={t_.id}>{t_.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.week || "all"} onValueChange={(v) => setFilter("week", v)}>
          <SelectTrigger className="w-[120px] h-9 text-xs bg-secondary/30">
            <SelectValue placeholder={t("label.allWeeks")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("label.allWeeks")}</SelectItem>
            {weeks.map((w) => (
              <SelectItem key={w} value={w}>{w}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Saved orders table */}
      <ServiceOrdersTable orders={orders as any} isLoading={isLoading} />
    </div>
  );
}
