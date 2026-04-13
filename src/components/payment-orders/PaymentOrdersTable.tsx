import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Pencil, Save, X, Loader2, Plus, CheckCircle2 } from "lucide-react";
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
import { BulkDeleteDialog } from "@/components/shared/BulkDeleteDialog";
import { useTechnicianEarnings, getTechEarnings } from "@/hooks/useTechnicianEarnings";

const paymentTextColor = (status: string): string => {
  const s = status?.toLowerCase();
  if (s === "paid" || s === "pago") return "text-emerald-400";
  if (s === "partial" || s === "parcial") return "text-amber-400";
  if (s === "pending" || s === "pendente") return "text-red-400";
  return "";
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
  const { data: earningsMap } = useTechnicianEarnings();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // --- Selection logic ---
  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleList = (listName: string | null) => {
    const listOrders = orders.filter(o => o.list_name === listName);
    const allSelected = listOrders.every(o => selected.has(o.id));
    setSelected(prev => {
      const next = new Set(prev);
      listOrders.forEach(o => {
        if (allSelected) next.delete(o.id); else next.add(o.id);
      });
      return next;
    });
  };

  const listNames = [...new Set(orders.map(o => o.list_name))];

  // Compute group status for each list
  const getListStatus = (listName: string | null): "paid" | "partial" | "pending" => {
    const listOrders = orders.filter(o => o.list_name === listName);
    if (!listOrders.length) return "pending";
    const allPaid = listOrders.every(o => o.status === "paid");
    const allPending = listOrders.every(o => o.status === "pending");
    if (allPaid) return "paid";
    if (allPending) return "pending";
    return "partial";
  };

  const groupStatusStyle: Record<string, string> = {
    paid: "text-emerald-400",
    partial: "text-amber-400",
    pending: "text-red-400",
  };

  const groupStatusLabel: Record<string, string> = {
    paid: "✓ Pago",
    partial: "◐ Parcial",
    pending: "● Pendente",
  };

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("payment_orders").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      // DB trigger auto-syncs service_orders status
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_orders"] });
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      toast.success(t("toast.updated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // Batch status change mutation
  const batchStatusMutation = useMutation({
    mutationFn: async ({ listName, status }: { listName: string; status: string }) => {
      const listOrderIds = orders.filter(o => o.list_name === listName).map(o => o.id);
      if (!listOrderIds.length) return;

      const { error } = await supabase
        .from("payment_orders")
        .update({ status, updated_at: new Date().toISOString() })
        .in("id", listOrderIds);
      if (error) throw error;

      // Sync all items of this week to service orders
      const listOrders = orders.filter(o => o.list_name === listName);
      for (const po of listOrders) {
        await syncServiceOrderStatus(po, status);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_orders"] });
      queryClient.invalidateQueries({ queryKey: ["payment_status_map"] });
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      toast.success("Status do lote atualizado");
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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("payment_orders").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_orders"] });
      queryClient.invalidateQueries({ queryKey: ["payment_status_map"] });
      setSelected(new Set());
      setShowDeleteDialog(false);
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
      const clientName = resolvedClientId
        ? (clients.find(c => c.id === resolvedClientId)?.name || existing.client_name || null)
        : (existing.client_name || null);
      const techName = resolvedTechId
        ? (technicians.find(t => t.id === resolvedTechId)?.name || existing.technician_name || null)
        : (existing.technician_name || null);

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

  // Group orders by list_name for rendering
  const groupedOrders = listNames.map(listName => ({
    listName,
    orders: orders.filter(o => o.list_name === listName),
    status: getListStatus(listName),
    total: orders.filter(o => o.list_name === listName).reduce((s, o) => s + (o.total || 0), 0),
  }));

  return (
    <div className="space-y-2">
      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selecionado(s)</span>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Excluir selecionados
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      {/* Groups with batch status control */}
      {groupedOrders.map(group => (
        <div key={group.listName || "__none__"} className="space-y-1">
          {/* Group header */}
          <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-4 py-2">
            <div className="flex items-center gap-3">
              <Button
                variant={orders.filter(o => o.list_name === group.listName).every(o => selected.has(o.id)) ? "secondary" : "outline"}
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => toggleList(group.listName)}
              >
                {group.listName || "Sem semana"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {group.orders.length} itens · {formatCurrency(group.total)}
              </span>
              <span className={cn("text-xs font-medium", groupStatusStyle[group.status])}>
                {groupStatusLabel[group.status]}
              </span>
            </div>

            {/* Batch status change */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground mr-1">Alterar lote:</span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => group.listName && batchStatusMutation.mutate({ listName: group.listName, status: "paid" })}
                disabled={batchStatusMutation.isPending || !group.listName}
              >
                <CheckCircle2 className="h-3 w-3 mr-0.5" /> Pago
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                onClick={() => group.listName && batchStatusMutation.mutate({ listName: group.listName, status: "partial" })}
                disabled={batchStatusMutation.isPending || !group.listName}
              >
                Parcial
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => group.listName && batchStatusMutation.mutate({ listName: group.listName, status: "pending" })}
                disabled={batchStatusMutation.isPending || !group.listName}
              >
                Pendente
              </Button>
            </div>
          </div>

          {/* Table for this group */}
          <div className="rounded-lg border border-border/50 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[11px]">
                  <TableHead className="w-10" />
                  <TableHead>{t("label.client")}</TableHead>
                  <TableHead>{t("label.platform")}</TableHead>
                  <TableHead>{t("label.list")}</TableHead>
                  <TableHead>{t("label.technician")}</TableHead>
                  <TableHead>{t("label.car")}</TableHead>
                  <TableHead>{t("label.plate")}</TableHead>
                  <TableHead>{t("label.services")}</TableHead>
                  <TableHead className="text-right">{t("label.total")}</TableHead>
                  <TableHead className="text-right">Tec. %</TableHead>
                  <TableHead>{t("label.status")}</TableHead>
                  <TableHead>{t("label.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.orders.map((o) => {
                  const isEditing = editingId === o.id && editForm;

                  if (isEditing) {
                    const computedTotal = editForm.services.reduce((sum, service) => sum + (Number(service.price) || 0), 0);
                    return (
                      <TableRow key={o.id} className="bg-primary/5 text-xs relative">
                        <TableCell className="p-1">
                          <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggleOne(o.id)} />
                        </TableCell>
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
                        <TableCell className="text-right text-[10px] text-muted-foreground">—</TableCell>
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
                  const rowAlert = getRowAlertLevel(o.created_at, o.status);
                  const daysOld = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000);
                  const techName = o.technician_name || o.technicians?.name;
                  const techEarn = getTechEarnings(techName, o.total, earningsMap);
                  return (
                    <TableRow key={o.id} className={cn("text-xs", paymentTextColor(o.status), poAlertStyle[rowAlert])}>
                      <TableCell className="w-10">
                        <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggleOne(o.id)} />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          <PoAlertIcon level={rowAlert} days={daysOld} />
                          {o.client_name || o.clients?.name || "—"}
                        </div>
                      </TableCell>
                      <TableCell>{o.platform || "—"}</TableCell>
                      <TableCell>{o.list_name || "—"}</TableCell>
                      <TableCell>{o.technician_name || o.technicians?.name || "—"}</TableCell>
                      <TableCell>{o.car_name || "—"}</TableCell>
                      <TableCell className="font-mono text-[11px]">{formatLicensePlate(o.license_plate) || "—"}</TableCell>
                      <TableCell className="max-w-[180px] truncate">{services.map((service) => service.name).join(", ") || "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatCurrency(o.total || 0)}</TableCell>
                      <TableCell className="text-right text-[10px] tabular-nums">
                        {techEarn ? (
                          <span className="text-muted-foreground">
                            {techEarn.percentage}% · <span className="text-foreground font-medium">{formatCurrency(techEarn.earnings)}</span>
                          </span>
                        ) : "—"}
                      </TableCell>
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
        </div>
      ))}

      <BulkDeleteDialog
        open={showDeleteDialog}
        count={selected.size}
        onConfirm={() => bulkDeleteMutation.mutate([...selected])}
        onCancel={() => setShowDeleteDialog(false)}
        isPending={bulkDeleteMutation.isPending}
      />
    </div>
  );
}

const normPlate = (p: string | null) => (p || "").replace(/[\s\-]/g, "").toUpperCase();

/** Sync PO status to matching SO — priority: service_order_id > week+plate */
async function syncServiceOrderStatus(po: PaymentOrderRow, newStatus: string) {
  try {
    const soIds: string[] = [];

    // Priority 1: direct link via service_order_id
    if ((po as any).service_order_id) {
      soIds.push((po as any).service_order_id);
    }

    // Priority 2: fallback via week (list_name) + normalized license_plate
    if (po.list_name && po.license_plate) {
      const normalizedPlate = normPlate(po.license_plate);
      if (normalizedPlate) {
        const { data: matchingSOs } = await supabase
          .from("service_orders")
          .select("id, license_plate")
          .eq("week", po.list_name);

        if (matchingSOs?.length) {
          for (const so of matchingSOs) {
            if (normPlate(so.license_plate) === normalizedPlate && !soIds.includes(so.id)) {
              soIds.push(so.id);
            }
          }
        }
      }
    }

    if (!soIds.length) return;

    // For each matched SO, calculate effective status from ALL matching POs
    for (const soId of soIds) {
      // Get the SO to know its week + plate
      const { data: so } = await supabase
        .from("service_orders")
        .select("id, week, license_plate")
        .eq("id", soId)
        .single();

      if (!so) continue;

      // Collect all POs linked to this SO (by service_order_id OR week+plate)
      const soNormPlate = normPlate(so.license_plate);
      const res1 = await supabase.from("payment_orders").select("status").eq("service_order_id", soId);
      let res2: { data: any[] | null } = { data: null };
      if (so.week && soNormPlate) {
        res2 = await supabase.from("payment_orders").select("status, license_plate").eq("list_name", so.week);
      }

      const statuses: string[] = [];
      // Direct matches
      (res1.data || []).forEach((r: any) => statuses.push(r.status));
      // Week+plate matches
      if (res2.data) {
        res2.data.forEach((r: any) => {
          if (normPlate(r.license_plate) === soNormPlate) {
            statuses.push(r.status);
          }
        });
      }

      // Dedupe isn't critical — we just need the aggregate
      if (!statuses.length) continue;

      const allPaid = statuses.every(s => s === "paid");
      const allPending = statuses.every(s => s === "pending");
      const effectiveStatus = allPaid ? "paid" : allPending ? "pending" : "partial";

      await supabase
        .from("service_orders")
        .update({ status: effectiveStatus, updated_at: new Date().toISOString() })
        .eq("id", soId);
    }
  } catch (err) {
    console.error("[Sync] Failed to sync SO status:", err);
  }
}
