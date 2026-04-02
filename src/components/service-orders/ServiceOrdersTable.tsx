import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Pencil, Save, X, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useClients, useTechnicians } from "@/hooks/useServiceOrders";
import { toast } from "sonner";

interface ServiceOrderRow {
  id: string;
  client_id: string | null;
  client_name?: string | null;
  platform: string | null;
  technician_id: string | null;
  technician_name?: string | null;
  week: string | null;
  car_name: string | null;
  license_plate: string | null;
  service_1_name: string | null;
  service_1_price: number | null;
  service_2_name: string | null;
  service_2_price: number | null;
  service_3_name: string | null;
  service_3_price: number | null;
  service_4_name: string | null;
  service_4_price: number | null;
  total: number | null;
  status: string;
  created_at: string;
  clients?: { name: string } | null;
  technicians?: { name: string } | null;
}

interface ServiceOrdersTableProps {
  orders: ServiceOrderRow[];
  isLoading: boolean;
}

const statusStyle: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  confirmed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  invoiced: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

interface EditState {
  client_id: string;
  platform: string;
  technician_id: string;
  week: string;
  car_name: string;
  license_plate: string;
  service_1_name: string;
  service_1_price: number;
  service_2_name: string;
  service_2_price: number;
  service_3_name: string;
  service_3_price: number;
  service_4_name: string;
  service_4_price: number;
}

const EMPTY_RELATION_VALUE = "__none__";

const toNullableText = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export function ServiceOrdersTable({ orders, isLoading }: ServiceOrdersTableProps) {
  const { t, formatCurrency } = useLanguage();
  const { user } = useAuth();
  const { data: clients = [] } = useClients();
  const { data: technicians = [] } = useTechnicians();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditState | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      toast.success(t("toast.deleted"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const updateMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!editForm) return;

      const total =
        (Number(editForm.service_1_price) || 0) +
        (Number(editForm.service_2_price) || 0) +
        (Number(editForm.service_3_price) || 0) +
        (Number(editForm.service_4_price) || 0);

      if (total === 0) {
        throw new Error(t("validate.inlineError") + ": " + t("validate.zeroTotal").replace("{n}", ""));
      }

      const { data: existing, error: existingError } = await supabase
        .from("service_orders")
        .select("*")
        .eq("id", id)
        .single();
      if (existingError) throw existingError;

      const resolvedClientId = editForm.client_id === EMPTY_RELATION_VALUE ? null : editForm.client_id;
      const resolvedTechId = editForm.technician_id === EMPTY_RELATION_VALUE ? null : editForm.technician_id;
      const clientName = resolvedClientId ? (clients.find(c => c.id === resolvedClientId)?.name || "") : "";
      const techName = resolvedTechId ? (technicians.find(t => t.id === resolvedTechId)?.name || "") : "";

      const payload = {
        ...existing,
        client_id: resolvedClientId,
        client_name: clientName,
        technician_id: resolvedTechId,
        technician_name: techName,
        platform: toNullableText(editForm.platform),
        week: toNullableText(editForm.week),
        car_name: toNullableText(editForm.car_name),
        license_plate: toNullableText(editForm.license_plate),
        service_1_name: toNullableText(editForm.service_1_name),
        service_1_price: Number(editForm.service_1_price) || 0,
        service_2_name: toNullableText(editForm.service_2_name),
        service_2_price: Number(editForm.service_2_price) || 0,
        service_3_name: toNullableText(editForm.service_3_name),
        service_3_price: Number(editForm.service_3_price) || 0,
        service_4_name: toNullableText(editForm.service_4_name),
        service_4_price: Number(editForm.service_4_price) || 0,
        total,
        created_by: existing.created_by ?? user?.id ?? null,
        created_at: existing.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      delete (payload as any).clients;
      delete (payload as any).technicians;

      console.log("SAVING DATA:", { id, formData: editForm, payload });

      const { error } = await supabase.from("service_orders").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      setEditingId(null);
      setEditForm(null);
      toast.success(t("toast.updated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const startEdit = (o: ServiceOrderRow) => {
    setEditingId(o.id);
    setEditForm({
      client_id: o.client_id || EMPTY_RELATION_VALUE,
      platform: o.platform || "",
      technician_id: o.technician_id || EMPTY_RELATION_VALUE,
      week: o.week || "",
      car_name: o.car_name || "",
      license_plate: o.license_plate || "",
      service_1_name: o.service_1_name || "",
      service_1_price: o.service_1_price ?? 0,
      service_2_name: o.service_2_name || "",
      service_2_price: o.service_2_price ?? 0,
      service_3_name: o.service_3_name || "",
      service_3_price: o.service_3_price ?? 0,
      service_4_name: o.service_4_name || "",
      service_4_price: o.service_4_price ?? 0,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const updateField = (field: keyof EditState, value: string | number) => {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!orders.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">{t("so.noOrders")}</p>
        <p className="text-xs mt-1">{t("so.uploadHint")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/30">
            <TableHead>{t("label.client")}</TableHead>
            <TableHead>{t("label.platform")}</TableHead>
            <TableHead>{t("label.technician")}</TableHead>
            <TableHead>{t("label.week")}</TableHead>
            <TableHead>{t("label.car")}</TableHead>
            <TableHead>{t("label.plate")}</TableHead>
            <TableHead>{t("label.services")}</TableHead>
            <TableHead className="text-right">{t("label.total")}</TableHead>
            <TableHead>{t("label.status")}</TableHead>
            <TableHead>{t("label.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => {
            const isEditing = editingId === o.id && editForm;

            if (isEditing) {
              const computedTotal =
                (Number(editForm.service_1_price) || 0) +
                (Number(editForm.service_2_price) || 0) +
                (Number(editForm.service_3_price) || 0) +
                (Number(editForm.service_4_price) || 0);

              return (
                <TableRow key={o.id} className="bg-primary/5 relative">
                  <TableCell colSpan={0} className="absolute -left-0 top-0 bottom-0 w-1 bg-primary rounded-l" />

                  <TableCell className="p-1 min-w-[170px]">
                    <Select value={editForm.client_id} onValueChange={(value) => updateField("client_id", value)}>
                      <SelectTrigger className="h-7 text-xs bg-background">
                        <SelectValue placeholder={t("label.client")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_RELATION_VALUE}>—</SelectItem>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1">
                    <Input className="h-7 text-xs" value={editForm.platform} onChange={(e) => updateField("platform", e.target.value)} />
                  </TableCell>
                  <TableCell className="p-1 min-w-[170px]">
                    <Select value={editForm.technician_id} onValueChange={(value) => updateField("technician_id", value)}>
                      <SelectTrigger className="h-7 text-xs bg-background">
                        <SelectValue placeholder={t("label.technician")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_RELATION_VALUE}>—</SelectItem>
                        {technicians.map((technician) => (
                          <SelectItem key={technician.id} value={technician.id}>
                            {technician.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1">
                    <Input className="h-7 text-xs w-16" value={editForm.week} onChange={(e) => updateField("week", e.target.value)} />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input className="h-7 text-xs" value={editForm.car_name} onChange={(e) => updateField("car_name", e.target.value)} />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input className="h-7 text-xs w-24 font-mono" value={editForm.license_plate} onChange={(e) => updateField("license_plate", e.target.value)} />
                  </TableCell>
                  <TableCell className="p-1">
                    <div className="space-y-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex gap-1">
                          <Input
                            className="h-6 text-[11px] px-1 w-20"
                            value={(editForm as any)[`service_${i}_name`]}
                            placeholder={`S${i}`}
                            onChange={(e) => updateField(`service_${i}_name` as keyof EditState, e.target.value)}
                          />
                          <Input
                            className="h-6 text-[11px] px-1 w-14 text-right tabular-nums"
                            type="number"
                            step="0.01"
                            value={(editForm as any)[`service_${i}_price`]}
                            onChange={(e) => updateField(`service_${i}_price` as keyof EditState, Number(e.target.value) || 0)}
                          />
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-primary tabular-nums">
                    {formatCurrency(computedTotal)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusStyle[o.status] || statusStyle.draft}>
                      {t(`status.${o.status}`, o.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-primary"
                        onClick={() => updateMutation.mutate(o.id)}
                        disabled={updateMutation.isPending}
                      >
                        {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            }

            const services = [o.service_1_name, o.service_2_name, o.service_3_name, o.service_4_name].filter(Boolean);
            return (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.client_name || o.clients?.name || "—"}</TableCell>
                <TableCell>{o.platform || "—"}</TableCell>
                <TableCell>{o.technician_name || o.technicians?.name || "—"}</TableCell>
                <TableCell>{o.week || "—"}</TableCell>
                <TableCell>{o.car_name || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{o.license_plate || "—"}</TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">{services.length ? services.join(", ") : "—"}</span>
                </TableCell>
                <TableCell className="text-right font-semibold text-primary tabular-nums">
                  {o.total != null ? formatCurrency(Number(o.total)) : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusStyle[o.status] || statusStyle.draft}>
                    {t(`status.${o.status}`, o.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(o)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(o.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
