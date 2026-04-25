import { useState, useCallback, useRef } from "react";
import { FileText, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/service-orders/FileUploadZone";
import { ExtractedDataTable } from "@/components/service-orders/ExtractedDataTable";
import { ExtractionStages } from "@/components/service-orders/ExtractionStages";
import { UploadQueue } from "@/components/service-orders/UploadQueue";
import { ServiceOrdersTable } from "@/components/service-orders/ServiceOrdersTable";
import { EmbeddedFileManager, storeFileInDocuments } from "@/components/file-manager/EmbeddedFileManager";
import { formatLicensePlate } from "@/lib/formatPlate";
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

export default function ServiceOrdersPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isAdmin, dbRole } = useRole();
  const isTechnicianRole = dbRole === "technician";
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<{
    client_id?: string;
    platform?: string;
    assigned_user_id?: string;
    week?: string;
  }>({});

  const [extractions, setExtractions] = useState<(ExtractionResult & { _id: string })[]>([]);
  const [sessionFiles, setSessionFiles] = useState<string[]>([]);
  const { data: orders = [], isLoading, saveMutation } = useServiceOrders(filters);
  const { extract } = useExtractServiceOrder();
  const { data: clients = [] } = useClients();
  const { data: technicians = [] } = useAssignableUsers();
  const { data: myAssignableUserId } = useMyAssignableUserId();
  const { data: earningsMap } = useTechnicianEarnings();
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

    // Resolve assigned_user_id per row according to role rules:
    //  - admin  -> from the row's selected user (UI dropdown stores user_id)
    //  - others -> auto-fill with the current user's id
    const inserts: ServiceOrderInsert[] = [];
    const missingUserRows: number[] = [];

    rows.forEach((r, idx) => {
      const clientMatch = clients.find(
        (c) => c.name.toLowerCase() === r.client?.toLowerCase()
      );

      // r.technician now holds technicians.user_id from the dropdown.
      // Fallback: legacy/OCR text — try case-insensitive name match.
      const rawTech = (r.technician ?? "").trim();
      const techByUser = technicians.find((t) => t.user_id === rawTech);
      const techByName = !techByUser
        ? technicians.find((t) => t.name.toLowerCase() === rawTech.toLowerCase())
        : undefined;
      const techMatch = techByUser ?? techByName;

      let assignedUserId: string | null = techMatch?.user_id ?? null;
      let technicianName: string = techMatch?.name ?? rawTech;

      if (isTechnicianRole) {
        // Technician users always save under their own identity
        if (user?.id) assignedUserId = user.id;
        if (myAssignableUserId) {
          const me = technicians.find((t) => t.user_id === myAssignableUserId);
          if (me) technicianName = me.name;
        }
      }

      console.log(`[ServiceOrders] Row ${idx + 1} user resolution:`, {
        rawValue: rawTech,
        assignedUserId,
        technicianId,
        technicianName,
        matchedBy: techByUser ? "user_id" : techByName ? "name" : "none",
      });

      if (!assignedUserId) {
        missingUserRows.push(idx + 1);
      }

      const payload: Record<string, any> = {
        client_id: clientMatch?.id || null,
        client_name: r.client?.trim() || clientMatch?.name || "",
        technician_name: technicianName,
        assigned_user_id: assignedUserId,
        platform: r.platform ?? null,
        week: r.week ?? null,
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
        group_id: r.week ?? null,
        created_by: user?.id ?? null,
      };

      // Calculate technician earnings from profit distribution rules
      const techName = payload.technician_name || r.technician;
      const techEarn = getTechEarnings(techName, payload.total, earningsMap);
      payload.technician_percentage = techEarn?.percentage ?? 0;
      payload.technician_earning = techEarn?.earnings ?? 0;

      inserts.push(payload as ServiceOrderInsert);
    });

    // Hard block: never let assigned_user_id reach the DB as null
    if (missingUserRows.length > 0) {
      const msg = isTechnicianRole
        ? "Sua conta não está autenticada. Faça login novamente antes de salvar."
        : `Selecione um usuário antes de salvar (linha(s): ${missingUserRows.join(", ")})`;
      toast.error(msg, { duration: 7000 });
      return;
    }

    console.log("SAVING DATA (mapped inserts):", JSON.stringify(inserts, null, 2));

    saveMutation.mutate(inserts, {
      onSuccess: () => {
        setExtractions(prev => prev.filter((e) => e._id !== extractionId));
        toast.success(
          inserts.length === 1
            ? "Ordem salva com sucesso"
            : `${inserts.length} ordens salvas com sucesso`,
          { duration: 4000 }
        );
      },
      onError: (err) => {
        const raw = (err as Error).message || "";
        if (/assigned_user_id|technician_id/i.test(raw)) {
          toast.error("Falha ao salvar: o usuário responsável é obrigatório.", { duration: 8000 });
        } else {
          toast.error(`Erro ao salvar. Verifique os dados e tente novamente.\n${raw}`, { duration: 8000 });
        }
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

      {/* Upload — gated by create permission */}
      <Can permission="service_orders.create">
        <FileUploadZone onFilesSelected={handleFiles} isProcessing={isProcessing} />
      </Can>

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
          technicians={technicians}
          isTechnicianRole={isTechnicianRole}
          isAdmin={isAdmin}
          myTechnicianName={
            myTechnicianId
              ? technicians.find((t) => t.id === myTechnicianId)?.name ?? null
              : null
          }
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

        <Select value={filters.assigned_user_id || "all"} onValueChange={(v) => setFilter("assigned_user_id", v)}>
          <SelectTrigger className="w-[160px] h-9 text-xs bg-secondary/30">
            <SelectValue placeholder={t("label.allTechnicians")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("label.allTechnicians")}</SelectItem>
            {technicians.filter((t_) => t_.user_id).map((t_) => (
              <SelectItem key={t_.id} value={t_.user_id as string}>{t_.name}</SelectItem>
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
