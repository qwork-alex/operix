import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Pencil, Save, X, Loader2, Plus } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useClients, useTechnicians } from "@/hooks/useServiceOrders";
import { toast } from "sonner";
import { formatLicensePlate } from "@/lib/formatPlate";
import type { Json } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { getRowAlertLevel, type AlertLevel } from "@/hooks/useAgingAlerts";
import { AlertTriangle, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const paymentRowColor = (status: string): string => {
  const s = status?.toLowerCase();
  if (s === "paid" || s === "pago") return "bg-emerald-500/8 border-l-2 border-l-emerald-500";
  if (s === "partial" || s === "parcial") return "bg-amber-500/8 border-l-2 border-l-amber-500";
  return "bg-red-500/8 border-l-2 border-l-red-500";
};

const poAlertStyle: Record<AlertLevel, string> = {
  none: "",
  level1: "ring-1 ring-amber-500/40",
  level2: "ring-1 ring-red-500/50 animate-pulse",
};

const PoAlertIcon = ({ level, days }: { level: AlertLevel; days: number }) => {
  if (level === "none") return null;
  const Icon = level === "level2" ? AlertTriangle : Clock;
  const color = level === "level2" ? "text-red-500" : "text-amber-500";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {level === "level2" ? `⚠️ ${days} dias sem pagamento` : `⏳ ${days} dias pendente`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

interface PaymentOrderRow {
  id: string;
  client_id: string | null;
  client_name?: string | null;
  clients?: { name: string } | null;
  platform: string | null;
  list_name: string | null;
  technician_id: string | null;
  technician_name?: string | null;
  technicians?: { name: string } | null;
  car_name: string | null;
  license_plate: string | null;
  services: Json | null;
  total: number | null;
  status: string;
  created_at: string;
}

const statusStyle: Record<string, string> = {
  pending: "bg-red-500/10 text-red-400 border-red-500/30",
  partial: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  matched: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  mismatch: "bg-red-500/10 text-red-400 border-red-500/30",
};

interface EditState {
  client_id: string;
  platform: string;
  list_name: string;
  technician_id: string;
  car_name: string;
  license_plate: string;
  services: { name: string; price: number }[];
}

const EMPTY_RELATION_VALUE = "__none__";

const toNullableText = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export function PaymentOrdersTable({ orders, isLoading }: { orders: PaymentOrderRow[]; isLoading: boolean }) {
  const { t, formatCurrency } = useLanguage();
  const { user } = useAuth();
  const { data: clients = [] } = useClients();
  const { data: technicians = [] } = useTechnicians();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditState | null>(null);

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("payment_orders").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_orders"] });
      queryClient.invalidateQueries({ queryKey: ["payment_status_map"] });
      toast.success(t("toast.updated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payment_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_orders"] });
      toast.success(t("toast.deleted"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const updateMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!editForm) return;

      const services = editForm.services.map((service) => ({
        name: service.name.trim(),
        price: Number(service.price) || 0,
      }));
      const filledServices = services.filter((service) => service.name);
      const computedTotal = filledServices.reduce((sum, service) => sum + service.price, 0);

      if (computedTotal === 0) {
        throw new Error(t("validate.inlineError") + ": " + t("validate.zeroTotal").replace("{n}", ""));
      }

      const { data: existing, error: existingError } = await supabase
        .from("payment_orders")
        .select("*")
        .eq("id", id)
        .single();
      if (existingError) throw existingError;

      const resolvedClientId = editForm.client_id === EMPTY_RELATION_VALUE ? null : editForm.client_id;
      const resolvedTechId = editForm.technician_id === EMPTY_RELATION_VALUE ? null : editForm.technician_id;
      const clientName = resolvedClientId ? (clients.find(c => c.id === resolvedClientId)?.name || null) : null;
      const techName = resolvedTechId ? (technicians.find(t => t.id === resolvedTechId)?.name || null) : null;

      const payload = {
        ...existing,
        client_id: resolvedClientId,
        client_name: clientName,
        technician_id: resolvedTechId,
        technician_name: techName,
        platform: toNullableText(editForm.platform),
        list_name: toNullableText(editForm.list_name),
        car_name: toNullableText(editForm.car_name),
        license_plate: formatLicensePlate(editForm.license_plate),
        services: filledServices as unknown as Json,
        total: computedTotal,
        created_by: existing.created_by ?? user?.id ?? null,
        created_at: existing.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      delete (payload as any).clients;
      delete (payload as any).technicians;

      console.log("SAVING DATA:", { id, formData: editForm, payload });

      const { error } = await supabase.from("payment_orders").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_orders"] });
      queryClient.invalidateQueries({ queryKey: ["payment_status_map"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      setEditingId(null);
      setEditForm(null);
      toast.success(t("toast.updated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const startEdit = (o: PaymentOrderRow) => {
    const services = Array.isArray(o.services) ? (o.services as { name: string; price: number }[]) : [];
    setEditingId(o.id);
    setEditForm({
      client_id: o.client_id || EMPTY_RELATION_VALUE,
      platform: o.platform || "",
      list_name: o.list_name || "",
      technician_id: o.technician_id || EMPTY_RELATION_VALUE,
      car_name: o.car_name || "",
      license_plate: o.license_plate || "",
      services: services.length > 0 ? [...services] : [{ name: "", price: 0 }],
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const updateService = (idx: number, field: "name" | "price", value: string | number) => {
    setEditForm((prev) => {
      if (!prev) return prev;
      const updated = [...prev.services];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, services: updated };
    });
  };

  const addService = () => {
    setEditForm((prev) => (prev ? { ...prev, services: [...prev.services, { name: "", price: 0 }] } : prev));
  };

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-border/50 bg-card p-8 text-center text-sm text-muted-foreground">
        {t("po.subtitle")}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="text-[11px]">
            <TableHead>{t("label.client")}</TableHead>
            <TableHead>{t("label.platform")}</TableHead>
            <TableHead>{t("label.list")}</TableHead>
            <TableHead>{t("label.technician")}</TableHead>
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
              const computedTotal = editForm.services.reduce((sum, service) => sum + (Number(service.price) || 0), 0);
              return (
                <TableRow key={o.id} className="bg-primary/5 text-xs relative">
                  <TableCell colSpan={0} className="absolute -left-0 top-0 bottom-0 w-1 bg-primary rounded-l p-0" />

                  <TableCell className="p-1 min-w-[170px]">
                    <Select value={editForm.client_id} onValueChange={(value) => setEditForm((prev) => (prev ? { ...prev, client_id: value } : prev))}>
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
                    <Input className="h-7 text-xs" value={editForm.platform} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, platform: e.target.value } : prev))} />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input className="h-7 text-xs" value={editForm.list_name} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, list_name: e.target.value } : prev))} />
                  </TableCell>
                  <TableCell className="p-1 min-w-[170px]">
                    <Select value={editForm.technician_id} onValueChange={(value) => setEditForm((prev) => (prev ? { ...prev, technician_id: value } : prev))}>
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
                    <Input className="h-7 text-xs" value={editForm.car_name} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, car_name: e.target.value } : prev))} />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input className="h-7 text-xs w-24 font-mono" value={editForm.license_plate} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, license_plate: e.target.value } : prev))} />
                  </TableCell>
                  <TableCell className="p-1">
                    <div className="space-y-1">
                      {editForm.services.map((service, serviceIndex) => (
                        <div key={serviceIndex} className="flex gap-1">
                          <Input
                            className="h-6 text-[11px] px-1 w-20"
                            value={service.name}
                            placeholder={t("extract.serviceName")}
                            onChange={(e) => updateService(serviceIndex, "name", e.target.value)}
                          />
                          <Input
                            className="h-6 text-[11px] px-1 w-14 text-right tabular-nums"
                            type="number"
                            step="0.01"
                            value={service.price}
                            onChange={(e) => updateService(serviceIndex, "price", Number(e.target.value) || 0)}
                          />
                        </div>
                      ))}
                      <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1" onClick={addService}>
                        <Plus className="h-3 w-3 mr-0.5" /> {t("extract.addService")}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-primary">
                    {formatCurrency(computedTotal)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusStyle[o.status] || statusStyle.pending}>
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

            const services = Array.isArray(o.services) ? (o.services as { name: string; price: number }[]) : [];
            return (
              <TableRow key={o.id} className={cn("text-xs", paymentRowColor(o.status))}>
                <TableCell className="font-medium">{o.client_name || o.clients?.name || "—"}</TableCell>
                <TableCell>{o.platform || "—"}</TableCell>
                <TableCell>{o.list_name || "—"}</TableCell>
                <TableCell>{o.technician_name || o.technicians?.name || "—"}</TableCell>
                <TableCell>{o.car_name || "—"}</TableCell>
                <TableCell className="font-mono text-[11px]">{formatLicensePlate(o.license_plate) || "—"}</TableCell>
                <TableCell className="max-w-[180px] truncate">{services.map((service) => service.name).join(", ") || "—"}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatCurrency(o.total || 0)}</TableCell>
                <TableCell>
                  <Select value={o.status} onValueChange={(v) => statusMutation.mutate({ id: o.id, status: v })}>
                    <SelectTrigger className={cn("h-7 w-[110px] text-[10px] border", statusStyle[o.status] || statusStyle.pending)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="partial">Parcial</SelectItem>
                      <SelectItem value="paid">Pago</SelectItem>
                    </SelectContent>
                  </Select>
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
