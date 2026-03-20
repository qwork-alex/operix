import { useState } from "react";
import { FileText, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/service-orders/FileUploadZone";
import { ExtractedDataTable } from "@/components/service-orders/ExtractedDataTable";
import { ServiceOrdersTable } from "@/components/service-orders/ServiceOrdersTable";
import {
  useServiceOrders,
  useExtractServiceOrder,
  useClients,
  useTechnicians,
  type ExtractedOrder,
  type ExtractionResult,
  type ServiceOrderInsert,
} from "@/hooks/useServiceOrders";
import { toast } from "sonner";

export default function ServiceOrdersPage() {
  const [filters, setFilters] = useState<{
    client_id?: string;
    platform?: string;
    technician_id?: string;
    week?: string;
  }>({});

  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const { data: orders = [], isLoading, saveMutation } = useServiceOrders(filters);
  const { extract, isExtracting } = useExtractServiceOrder();
  const { data: clients = [] } = useClients();
  const { data: technicians = [] } = useTechnicians();

  // Derive unique platforms and weeks from existing orders
  const platforms = [...new Set((orders as any[]).map((o) => o.platform).filter(Boolean))];
  const weeks = [...new Set((orders as any[]).map((o) => o.week).filter(Boolean))];

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const result = await extract(file);
        setExtraction(result);
        if (result.confidence === "low") {
          toast.warning("Low confidence extraction — please review carefully.");
        }
      } catch (err) {
        toast.error("Extraction failed: " + (err as Error).message);
      }
    }
  };

  const handleSave = (rows: ExtractedOrder[]) => {
    // Map extracted data → service_orders inserts
    // We need to resolve client/technician names to IDs
    const inserts: ServiceOrderInsert[] = rows.map((r) => {
      const clientMatch = clients.find(
        (c) => c.name.toLowerCase() === r.client?.toLowerCase()
      );
      const techMatch = technicians.find(
        (t) => t.name.toLowerCase() === r.technician?.toLowerCase()
      );
      return {
        client_id: clientMatch?.id || null,
        technician_id: techMatch?.id || null,
        platform: r.platform,
        week: r.week,
        car_name: r.car_name,
        license_plate: r.license_plate,
        service_1_name: r.service_1_name,
        service_1_price: r.service_1_price,
        service_2_name: r.service_2_name,
        service_2_price: r.service_2_price,
        service_3_name: r.service_3_name,
        service_3_price: r.service_3_price,
        service_4_name: r.service_4_name,
        service_4_price: r.service_4_price,
        total: r.total,
        status: "draft",
      };
    });

    saveMutation.mutate(inserts, {
      onSuccess: () => setExtraction(null),
    });
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
          <h1 className="text-lg font-semibold text-foreground">Service Orders</h1>
          <p className="text-xs text-muted-foreground">
            Upload documents to extract service data automatically
          </p>
        </div>
      </div>

      {/* Upload */}
      <FileUploadZone onFilesSelected={handleFiles} isProcessing={isExtracting} />

      {/* Extraction preview */}
      {extraction && (
        <ExtractedDataTable
          orders={extraction.orders}
          confidence={extraction.confidence}
          notes={extraction.notes}
          onSave={handleSave}
          onDiscard={() => setExtraction(null)}
          isSaving={saveMutation.isPending}
        />
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filters.client_id || "all"} onValueChange={(v) => setFilter("client_id", v)}>
          <SelectTrigger className="w-[160px] h-9 text-xs bg-secondary/30">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.platform || "all"} onValueChange={(v) => setFilter("platform", v)}>
          <SelectTrigger className="w-[140px] h-9 text-xs bg-secondary/30">
            <SelectValue placeholder="All platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.technician_id || "all"} onValueChange={(v) => setFilter("technician_id", v)}>
          <SelectTrigger className="w-[160px] h-9 text-xs bg-secondary/30">
            <SelectValue placeholder="All technicians" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All technicians</SelectItem>
            {technicians.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.week || "all"} onValueChange={(v) => setFilter("week", v)}>
          <SelectTrigger className="w-[120px] h-9 text-xs bg-secondary/30">
            <SelectValue placeholder="All weeks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All weeks</SelectItem>
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
