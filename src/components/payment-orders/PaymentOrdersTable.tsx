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
import { Trash2, Pencil, Save, X, Loader2, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useClients } from "@/hooks/useServiceOrders";
import { useAssignableUsers } from "@/hooks/useAssignableUsers";
import { toast } from "sonner";
import { formatLicensePlate } from "@/lib/formatPlate";
import type { Json } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { getRowAlertLevel, type AlertLevel } from "@/hooks/useAgingAlerts";
import { AlertTriangle, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BulkDeleteDialog } from "@/components/shared/BulkDeleteDialog";
import { Can } from "@/components/Can";
import { getCurrentUserId, logSaveError, logSavePayload } from "@/lib/authUser";

const MAX_SERVICES = 4;

interface ServiceEntry {
  name: string;
  price: number;
}

function padServices(services: ServiceEntry[]): ServiceEntry[] {
  const result = services.slice(0, MAX_SERVICES);
  while (result.length < MAX_SERVICES) {
    result.push({ name: "", price: 0 });
  }
  return result;
}

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
  technician_name?: string | null;
  user_id?: string | null;
  assigned_user_id?: string | null;
  technicians?: { name: string } | null;
  car_name: string | null;
  license_plate: string | null;
  services: Json | null;
  total: number | null;
  amount_paid?: number | null;
  status: string;
  created_at: string;
}

/** Derive status strictly from amount_paid vs total. */
function deriveStatus(total: number, amountPaid: number): "pending" | "partial" | "paid" {
  if (!amountPaid || amountPaid <= 0) return "pending";
  if (total > 0 && amountPaid >= total) return "paid";
  return "partial";
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
  assigned_user_id: string;
  car_name: string;
  license_plate: string;
  services: ServiceEntry[];
}

const EMPTY_RELATION_VALUE = "__none__";

const toNullableText = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export function PaymentOrdersTable({ orders, isLoading }: { orders: PaymentOrderRow[]; isLoading: boolean }) {
  const { t, formatCurrency } = useLanguage();
  const { data: clients = [] } = useClients();
  const { data: technicians = [] } = useAssignableUsers();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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

  /** Update amount_paid → derive status server-side write */
  const paymentMutation = useMutation({
    mutationFn: async ({ id, amount_paid, total }: { id: string; amount_paid: number; total: number }) => {
      const currentUserId = await getCurrentUserId();
      const status = deriveStatus(total, amount_paid);
      const payload = { amount_paid, status, updated_at: new Date().toISOString() } as any;
      logSavePayload("PaymentOrdersTable:payment", currentUserId, payload);
      const { error } = await (supabase as any)
        .from("payment_orders")
        .update(payload)
        .eq("id", id);
      if (error) {
        logSaveError("PaymentOrdersTable:payment", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_orders"] });
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  /** Batch: mark whole list as fully paid / partial reset / pending reset (amount_paid driven) */
  const batchStatusMutation = useMutation({
    mutationFn: async ({ listName, mode }: { listName: string; mode: "paid" | "pending" }) => {
      const currentUserId = await getCurrentUserId();
      const listOrders = orders.filter(o => o.list_name === listName);
      for (const o of listOrders) {
        const total = o.total || 0;
        const amount_paid = mode === "paid" ? total : 0;
        const status = deriveStatus(total, amount_paid);
        const payload = { amount_paid, status, updated_at: new Date().toISOString() } as any;
        logSavePayload("PaymentOrdersTable:batch", currentUserId, payload);
        const { error } = await (supabase as any)
          .from("payment_orders")
          .update(payload)
          .eq("id", o.id);
        if (error) {
          logSaveError("PaymentOrdersTable:batch", error);
          throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_orders"] });
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      toast.success("Status do lote atualizado");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { assertedDelete } = await import("@/lib/assertDelete");
      await assertedDelete("payment_orders", (q) => q.eq("id", id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_orders"] });
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      toast.success(t("toast.deleted"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { assertedDelete } = await import("@/lib/assertDelete");
      await assertedDelete("payment_orders", (q) => q.in("id", ids), ids.length);
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
      const currentUserId = await getCurrentUserId();

      // Find the original row to preserve existing data
      const originalRow = orders.find(o => o.id === id);

      const filledServices = editForm.services
        .map(s => ({ name: s.name.trim(), price: Number(s.price) || 0 }))
        .filter(s => s.name);
      const computedTotal = filledServices.reduce((sum, s) => sum + s.price, 0);

      if (computedTotal === 0) {
        throw new Error(t("validate.inlineError") + ": " + t("validate.zeroTotal").replace("{n}", ""));
      }

      const resolvedClientId = editForm.client_id === EMPTY_RELATION_VALUE ? null : editForm.client_id;
      const resolvedAssignedUserId = editForm.assigned_user_id === EMPTY_RELATION_VALUE ? null : editForm.assigned_user_id;
      const techMatch = resolvedAssignedUserId
        ? technicians.find((t) => t.user_id === resolvedAssignedUserId)
        : null;

      const clientName = resolvedClientId
        ? (clients.find(c => c.id === resolvedClientId)?.name || originalRow?.client_name || null)
        : (originalRow?.client_name || null);
      const techName = techMatch?.name || originalRow?.technician_name || null;

      const payload: Partial<{
        client_id: string | null;
        client_name: string | null;
        technician_name: string | null;
        user_id: string | null;
        assigned_user_id: string | null;
        platform: string | null;
        list_name: string | null;
        car_name: string | null;
        license_plate: string | null;
        services: Json;
        total: number;
        updated_at: string;
      }> = {
        updated_at: new Date().toISOString(),
        services: filledServices as unknown as Json,
        total: computedTotal,
      };

      // Only include fields that actually changed
      if (resolvedClientId !== (originalRow?.client_id ?? null)) {
        payload.client_id = resolvedClientId;
      }
      if (clientName !== (originalRow?.client_name ?? null)) {
        payload.client_name = clientName;
      }
      if (resolvedAssignedUserId !== (originalRow?.assigned_user_id ?? null)) {
        payload.user_id = resolvedAssignedUserId;
        payload.assigned_user_id = resolvedAssignedUserId;
      }
      if (techName !== (originalRow?.technician_name ?? null)) {
        payload.technician_name = techName;
      }

      const platformVal = toNullableText(editForm.platform);
      if (platformVal !== (originalRow?.platform ?? null)) {
        payload.platform = platformVal;
      }
      const listVal = toNullableText(editForm.list_name);
      if (listVal !== (originalRow?.list_name ?? null)) {
        payload.list_name = listVal;
      }
      const carVal = toNullableText(editForm.car_name);
      if (carVal !== (originalRow?.car_name ?? null)) {
        payload.car_name = carVal;
      }
      const plateVal = formatLicensePlate(editForm.license_plate);
      if (plateVal !== (originalRow?.license_plate ?? null)) {
        payload.license_plate = plateVal;
      }

      logSavePayload("PaymentOrdersTable:update", currentUserId, payload);

      const { error } = await (supabase as any).from("payment_orders").update(payload).eq("id", id);
      if (error) {
        logSaveError("PaymentOrdersTable:update", error);
        throw error;
      }
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
    const rawServices = Array.isArray(o.services) ? (o.services as unknown as ServiceEntry[]) : [];
    setEditingId(o.id);
    setEditForm({
      client_id: o.client_id || EMPTY_RELATION_VALUE,
      platform: o.platform || "",
      list_name: o.list_name || "",
      assigned_user_id: o.assigned_user_id || EMPTY_RELATION_VALUE,
      car_name: o.car_name || "",
      license_plate: o.license_plate || "",
      services: padServices(rawServices),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  /** Update a single service at a specific index */
  const updateService = (idx: number, field: "name" | "price", value: string | number) => {
    setEditForm(prev => {
      if (!prev) return prev;
      const updated = [...prev.services];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, services: updated };
    });
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

  const groupedOrders = listNames.map(listName => {
    const groupOrders = orders.filter(o => o.list_name === listName);
    // Calculate max services used in this group for dynamic column rendering
    const maxServices = groupOrders.reduce((max, o) => {
      const raw = Array.isArray(o.services) ? (o.services as unknown as ServiceEntry[]) : [];
      const filled = raw.filter(s => s.name || s.price).length;
      return Math.max(max, filled);
    }, 0) || 1; // at least 1 column
    return {
      listName,
      orders: groupOrders,
      status: getListStatus(listName),
      total: groupOrders.reduce((s, o) => s + (o.total || 0), 0),
      maxServices: Math.min(maxServices, MAX_SERVICES),
    };
  });

  return (
    <div className="space-y-2">
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selecionado(s)</span>
          <Can permission="payment_orders.delete">
            <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-3 w-3 mr-1" /> Excluir selecionados
            </Button>
          </Can>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      {groupedOrders.map(group => (
        <div key={group.listName || "__none__"} className="space-y-1">
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
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground mr-1">Alterar lote:</span>
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => group.listName && batchStatusMutation.mutate({ listName: group.listName, mode: "paid" })}
                disabled={batchStatusMutation.isPending || !group.listName}>
                <CheckCircle2 className="h-3 w-3 mr-0.5" /> Pago
              </Button>
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => group.listName && batchStatusMutation.mutate({ listName: group.listName, mode: "pending" })}
                disabled={batchStatusMutation.isPending || !group.listName}>
                Pendente
              </Button>
            </div>
          </div>

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
                  {/* Dynamic service columns: edit mode shows all 4, view mode shows group.maxServices */}
                  {Array.from({ length: editingId && group.orders.some(o => o.id === editingId) ? MAX_SERVICES : group.maxServices }, (_, i) => i + 1).map(n => (
                    <TableHead key={`sh${n}`} colSpan={2} className="text-center">
                      {t("label.service")} {n}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">{t("label.total")}</TableHead>
                  <TableHead>{t("label.status")}</TableHead>
                  <TableHead>{t("label.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.orders.map((o) => {
                  const isEditing = editingId === o.id && editForm;

                  if (isEditing) {
                    const computedTotal = editForm.services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
                    return (
                      <TableRow key={o.id} className="bg-primary/5 text-xs relative">
                        <TableCell className="p-1">
                          <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggleOne(o.id)} />
                        </TableCell>
                        <TableCell className="p-1 min-w-[140px]">
                          <Select value={editForm.client_id} onValueChange={v => setEditForm(prev => prev ? { ...prev, client_id: v } : prev)}>
                            <SelectTrigger className="h-7 text-xs bg-background"><SelectValue placeholder={t("label.client")} /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EMPTY_RELATION_VALUE}>—</SelectItem>
                              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-1">
                          <Input className="h-7 text-xs" value={editForm.platform} onChange={e => setEditForm(prev => prev ? { ...prev, platform: e.target.value } : prev)} />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input className="h-7 text-xs" value={editForm.list_name} onChange={e => setEditForm(prev => prev ? { ...prev, list_name: e.target.value } : prev)} />
                        </TableCell>
                        <TableCell className="p-1 min-w-[140px]">
                          <Select value={editForm.assigned_user_id} onValueChange={v => setEditForm(prev => prev ? { ...prev, assigned_user_id: v } : prev)}>
                            <SelectTrigger className="h-7 text-xs bg-background"><SelectValue placeholder={t("label.technician")} /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EMPTY_RELATION_VALUE}>—</SelectItem>
                              {technicians.map(tech => <SelectItem key={tech.user_id} value={tech.user_id}>{tech.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-1">
                          <Input className="h-7 text-xs" value={editForm.car_name} onChange={e => setEditForm(prev => prev ? { ...prev, car_name: e.target.value } : prev)} />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input className="h-7 text-xs w-24 font-mono" value={editForm.license_plate} onChange={e => setEditForm(prev => prev ? { ...prev, license_plate: e.target.value } : prev)} />
                        </TableCell>
                        {editForm.services.map((service, si) => (
                          <EditServiceCellPair
                            key={si}
                            service={service}
                            onNameChange={v => updateService(si, "name", v)}
                            onPriceChange={v => updateService(si, "price", Number(v) || 0)}
                          />
                        ))}
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
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => updateMutation.mutate(o.id)} disabled={updateMutation.isPending}>
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

                   const rawServices = Array.isArray(o.services) ? (o.services as unknown as ServiceEntry[]) : [];
                  const groupHasEdit = editingId != null && group.orders.some(go => go.id === editingId);
                  const visibleCols = groupHasEdit ? MAX_SERVICES : group.maxServices;
                  const services = padServices(rawServices).slice(0, visibleCols);
                  const rowAlert = getRowAlertLevel(o.created_at, o.status);
                  const daysOld = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000);

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
                      {services.map((s, si) => (
                        <ReadServiceCellPair key={si} service={s} formatCurrency={formatCurrency} />
                      ))}
                      <TableCell className="text-right font-medium tabular-nums">{formatCurrency(o.total || 0)}</TableCell>
                      <TableCell>
                        <PaymentStatusCell
                          orderId={o.id}
                          total={o.total || 0}
                          amountPaid={Number(o.amount_paid) || 0}
                          derivedStatus={deriveStatus(o.total || 0, Number(o.amount_paid) || 0)}
                          formatCurrency={formatCurrency}
                          onSubmit={(amount_paid) => paymentMutation.mutate({ id: o.id, amount_paid, total: o.total || 0 })}
                          isPending={paymentMutation.isPending}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Can permission="payment_orders.edit">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(o)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </Can>
                          <Can permission="payment_orders.delete">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(o.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </Can>
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

/** Read-only service name + price cells */
function ReadServiceCellPair({ service, formatCurrency }: { service: ServiceEntry; formatCurrency: (n: number) => string }) {
  return (
    <>
      <TableCell className="text-[11px] truncate max-w-[80px]">{service.name || "—"}</TableCell>
      <TableCell className="text-[11px] text-right tabular-nums">{service.price ? formatCurrency(service.price) : "—"}</TableCell>
    </>
  );
}

/** Editable service name + price cells */
function EditServiceCellPair({ service, onNameChange, onPriceChange }: {
  service: ServiceEntry;
  onNameChange: (v: string) => void;
  onPriceChange: (v: number) => void;
}) {
  return (
    <>
      <TableCell className="p-1">
        <Input className="h-6 text-[11px] px-1 w-20" value={service.name} placeholder="—" onChange={e => onNameChange(e.target.value)} />
      </TableCell>
      <TableCell className="p-1">
        <Input className="h-6 text-[11px] px-1 w-14 text-right tabular-nums" type="number" step="0.01"
          value={service.price || ""} placeholder="0" onChange={e => onPriceChange(Number(e.target.value) || 0)} />
      </TableCell>
    </>
  );
}

/** Status cell driven by amount_paid. Shows badge + inline editable Amount Paid input. */
function PaymentStatusCell({
  total,
  amountPaid,
  derivedStatus,
  formatCurrency,
  onSubmit,
  isPending,
}: {
  orderId: string;
  total: number;
  amountPaid: number;
  derivedStatus: "pending" | "partial" | "paid";
  formatCurrency: (n: number) => string;
  onSubmit: (amountPaid: number) => void;
  isPending: boolean;
}) {
  const [draft, setDraft] = useState<string>(amountPaid ? String(amountPaid) : "");
  const [open, setOpen] = useState(false);
  const remaining = Math.max(0, total - amountPaid);

  const commit = () => {
    const v = Math.max(0, Number(draft) || 0);
    if (v !== amountPaid) onSubmit(v);
    setOpen(false);
  };

  const quickPaid = () => {
    setDraft(String(total));
    if (total !== amountPaid) onSubmit(total);
    setOpen(false);
  };
  const quickReset = () => {
    setDraft("0");
    if (amountPaid !== 0) onSubmit(0);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <div className="flex items-center gap-1">
        <Badge
          variant="outline"
          className={cn("cursor-pointer text-[10px]", statusStyle[derivedStatus])}
          onClick={() => setOpen(o => !o)}
        >
          {derivedStatus === "paid" ? "✓ Pago" : derivedStatus === "partial" ? "◐ Parcial" : "● Pendente"}
        </Badge>
        {isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      {(open || derivedStatus === "partial") && (
        <div className="flex flex-col gap-1 rounded-md border border-border/50 bg-background/50 p-1.5">
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step="0.01"
              min="0"
              max={total}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === "Enter") commit(); }}
              placeholder="Valor pago"
              className="h-6 text-[10px] px-1 tabular-nums"
            />
          </div>
          <div className="flex items-center justify-between text-[10px] tabular-nums">
            <span className="text-emerald-400">Pago: {formatCurrency(amountPaid)}</span>
            <span className={cn(remaining > 0 ? "text-amber-400" : "text-muted-foreground")}>
              Resta: {formatCurrency(remaining)}
            </span>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-5 text-[9px] px-1 flex-1" onClick={quickPaid}>
              Total
            </Button>
            <Button size="sm" variant="ghost" className="h-5 text-[9px] px-1 flex-1" onClick={quickReset}>
              Zerar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
