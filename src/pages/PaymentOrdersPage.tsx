import { useState } from "react";
import { CreditCard, Filter, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileUploadZone } from "@/components/service-orders/FileUploadZone";
import { ExtractedPaymentTable } from "@/components/payment-orders/ExtractedPaymentTable";
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

  const [extraction, setExtraction] = useState<PaymentExtractionResult | null>(null);
  const { data: orders = [], isLoading, saveMutation } = usePaymentOrders(filters);
  const { extract, isExtracting } = useExtractPaymentOrder();
  const { data: clients = [] } = useClients();
  const { data: technicians = [] } = useTechnicians();
  const detectMutation = useDiscrepancyDetection();

  const platforms = [...new Set((orders as any[]).map(o => o.platform).filter(Boolean))];
  const listNames = [...new Set((orders as any[]).map(o => o.list_name).filter(Boolean))];

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const result = await extract(file);
        setExtraction(result);
        if (result.confidence === "low") {
          toast.warning("Low confidence — please review carefully.");
        }
      } catch (err) {
        toast.error("Extraction failed: " + (err as Error).message);
      }
    }
  };

  const handleSave = (rows: ExtractedPaymentOrder[]) => {
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
        setExtraction(null);
        // Auto-trigger discrepancy detection after saving
        detectMutation.mutate();
      },
    });
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
            <h1 className="text-lg font-semibold text-foreground">Payment Orders</h1>
            <p className="text-xs text-muted-foreground">Upload payment lists and auto-detect discrepancies</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => detectMutation.mutate()}
          disabled={detectMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${detectMutation.isPending ? "animate-spin" : ""}`} />
          Run Detection
        </Button>
      </div>

      <FileUploadZone onFilesSelected={handleFiles} isProcessing={isExtracting} />

      {extraction && (
        <ExtractedPaymentTable
          orders={extraction.orders}
          confidence={extraction.confidence}
          notes={extraction.notes}
          onSave={handleSave}
          onDiscard={() => setExtraction(null)}
          isSaving={saveMutation.isPending}
        />
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filters.client_id || "all"} onValueChange={v => setFilter("client_id", v)}>
          <SelectTrigger className="w-[160px] h-9 text-xs bg-secondary/30"><SelectValue placeholder="All clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.platform || "all"} onValueChange={v => setFilter("platform", v)}>
          <SelectTrigger className="w-[140px] h-9 text-xs bg-secondary/30"><SelectValue placeholder="All platforms" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {platforms.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.technician_id || "all"} onValueChange={v => setFilter("technician_id", v)}>
          <SelectTrigger className="w-[160px] h-9 text-xs bg-secondary/30"><SelectValue placeholder="All technicians" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All technicians</SelectItem>
            {technicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.list_name || "all"} onValueChange={v => setFilter("list_name", v)}>
          <SelectTrigger className="w-[140px] h-9 text-xs bg-secondary/30"><SelectValue placeholder="All lists" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lists</SelectItem>
            {listNames.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <PaymentOrdersTable orders={orders as any} isLoading={isLoading} />
    </div>
  );
}
