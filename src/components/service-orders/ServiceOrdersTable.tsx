import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Pencil, Save, X, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useServiceOrders";
import { useAssignableUsers } from "@/hooks/useAssignableUsers";
import { toast } from "sonner";
import { formatLicensePlate } from "@/lib/formatPlate";
import { cn } from "@/lib/utils";
import { getRowAlertLevel, type AlertLevel } from "@/hooks/useAgingAlerts";
import { AlertTriangle, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BulkDeleteDialog } from "@/components/shared/BulkDeleteDialog";
import { useTechnicianEarnings, getTechEarnings } from "@/hooks/useTechnicianEarnings";
import { Can } from "@/components/Can";

interface ServiceOrderRow {
  id: string;
  client_id: string | null;
  client_name?: string | null;
  platform: string | null;
  technician_name?: string | null;
  assigned_user_id?: string | null;
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

type PaymentStatus = "paid" | "partial" | "pending" | "draft" | "none";

const paymentTextStyle: Record<PaymentStatus, string> = {
  paid: "text-emerald-400",
  partial: "text-amber-400",
  pending: "text-red-400",
  draft: "",
  none: "",
};

const paymentBadgeStyle: Record<PaymentStatus, string> = {
  paid: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  partial: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  pending: "bg-red-500/10 text-red-500 border-red-500/30",
  draft: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
};

const paymentLabel: Record<PaymentStatus, string> = {
  paid: "Pago",
  partial: "Parcial",
  pending: "Pendente",
  draft: "Rascunho",
  none: "Sem pagamento",
};

interface EditState {
  client_id: string;
  platform: string;
  assigned_user_id: string;
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
  const { data: technicians = [] } = useAssignableUsers();
  const { data: earningsMap } = useTechnicianEarnings();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Use DB-stored status as single source of truth (synced by DB trigger)
  const getPaymentStatus = (o: ServiceOrderRow): PaymentStatus => {
    const s = o.status?.toLowerCase();
    if (s === "paid") return "paid";
    if (s === "partial") return "partial";
    if (s === "pending") return "pending";
    if (s === "draft") return "draft";
    return "none";
  };

  const alertStyle: Record<AlertLevel, string> = {
    none: "",
    level1: "ring-1 ring-amber-500/40",
    level2: "ring-1 ring-red-500/50 animate-pulse",
  };

  const AlertIcon = ({ level, days }: { level: AlertLevel; days: number }) => {
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

  // --- Selection logic ---
  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleWeek = (week: string | null) => {
    const weekOrders = orders.filter(o => o.week === week);
    const allSelected = weekOrders.every(o => selected.has(o.id));
    setSelected(prev => {
      const next = new Set(prev);
      weekOrders.forEach(o => {
        if (allSelected) next.delete(o.id); else next.add(o.id);
      });
      return next;
    });
  };

  const allWeeks = [...new Set(orders.map(o => o.week))];

  // Compute group status for each week
  const getWeekStatus = (week: string | null): PaymentStatus => {
    const weekOrders = orders.filter(o => o.week === week);
    if (!weekOrders.length) return "none";
    const statuses = weekOrders.map(o => getPaymentStatus(o));
    const allPaid = statuses.every(s => s === "paid");
    const allPending = statuses.every(s => s === "pending" || s === "none" || s === "draft");
    if (allPaid) return "paid";
    if (allPending) return "pending";
    return "partial";
  };

  const groupStatusLabel: Record<PaymentStatus, string> = {
    paid: "✓ Pago",
    partial: "◐ Parcial",
    pending: "● Pendente",
    draft: "— Rascunho",
    none: "— Sem dados",
  };

  // --- Delete mutation ---
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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("service_orders").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
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
      const resolvedAssignedUserId = editForm.assigned_user_id === EMPTY_RELATION_VALUE ? null : editForm.assigned_user_id;
      const finalAssignedUserId = resolvedAssignedUserId ?? existing.assigned_user_id;
      if (!finalAssignedUserId) {
        throw new Error("assigned_user_id is required. Please select a user.");
      }
      const techMatch = resolvedAssignedUserId
        ? technicians.find((t) => t.user_id === resolvedAssignedUserId)
        : null;
      const clientName = resolvedClientId
        ? (clients.find(c => c.id === resolvedClientId)?.name || existing.client_name || "")
        : (existing.client_name || "");
      const techName = techMatch?.name || existing.technician_name || "";

      // Calculate technician earnings from profit distribution rules
      const techEarn = getTechEarnings(techName, total, earningsMap);

      const payload = {
        ...existing,
        client_id: resolvedClientId,
        client_name: clientName,
        technician_name: techName,
        assigned_user_id: finalAssignedUserId,
        platform: toNullableText(editForm.platform),
        week: toNullableText(editForm.week),
        car_name: toNullableText(editForm.car_name),
        license_plate: formatLicensePlate(editForm.license_plate),
        service_1_name: toNullableText(editForm.service_1_name),
        service_1_price: Number(editForm.service_1_price) || 0,
        service_2_name: toNullableText(editForm.service_2_name),
        service_2_price: Number(editForm.service_2_price) || 0,
        service_3_name: toNullableText(editForm.service_3_name),
        service_3_price: Number(editForm.service_3_price) || 0,
        service_4_name: toNullableText(editForm.service_4_name),
        service_4_price: Number(editForm.service_4_price) || 0,
        total,
        technician_percentage: techEarn?.percentage ?? 0,
        technician_earning: techEarn?.earnings ?? 0,
        created_by: existing.created_by ?? user?.id ?? null,
        created_at: existing.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      delete (payload as any).clients;
      delete (payload as any).technicians;
      delete (payload as any).technician_id;

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
      assigned_user_id: o.assigned_user_id || EMPTY_RELATION_VALUE,
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

  // Group orders by week
  const groupedOrders = allWeeks.map(week => ({
    week,
    orders: orders.filter(o => o.week === week),
    status: getWeekStatus(week),
    total: orders.filter(o => o.week === week).reduce((s, o) => s + (Number(o.total) || 0), 0),
  }));

  return (
    <div className="space-y-4">
      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selecionado(s)</span>
          <Can permission="service_orders.delete">
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Excluir selecionados
            </Button>
          </Can>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      {/* Grouped by week */}
      {groupedOrders.map(group => (
        <div key={group.week || "__none__"} className="space-y-1">
          {/* Week group header */}
          <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-4 py-2">
            <div className="flex items-center gap-3">
              <Button
                variant={group.orders.every(o => selected.has(o.id)) ? "secondary" : "outline"}
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => toggleWeek(group.week)}
              >
                {group.week || "Sem semana"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {group.orders.length} itens · {formatCurrency(group.total)}
              </span>
              <span className={cn("text-xs font-medium", paymentTextStyle[group.status])}>
                {groupStatusLabel[group.status]}
              </span>
            </div>
          </div>

          {/* Table for this week */}
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/30">
                  <TableHead className="w-10" />
                  <TableHead>{t("label.client")}</TableHead>
                  <TableHead>{t("label.platform")}</TableHead>
                  <TableHead>{t("label.technician")}</TableHead>
                  <TableHead>{t("label.week")}</TableHead>
                  <TableHead>{t("label.car")}</TableHead>
                  <TableHead>{t("label.plate")}</TableHead>
                  <TableHead>{t("label.services")}</TableHead>
                  <TableHead className="text-right">{t("label.total")}</TableHead>
                  <TableHead className="text-right">Tec. %</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>{t("label.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.orders.map((o) => {
                  const isEditing = editingId === o.id && editForm;
                  const ps = getPaymentStatus(o);

                  if (isEditing) {
                    const computedTotal =
                      (Number(editForm.service_1_price) || 0) +
                      (Number(editForm.service_2_price) || 0) +
                      (Number(editForm.service_3_price) || 0) +
                      (Number(editForm.service_4_price) || 0);

                    return (
                      <TableRow key={o.id} className={cn("relative", paymentTextStyle[ps])}>
                        <TableCell className="p-1">
                          <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggleOne(o.id)} />
                        </TableCell>
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
                          <Select value={editForm.assigned_user_id} onValueChange={(value) => updateField("assigned_user_id", value)}>
                            <SelectTrigger className="h-7 text-xs bg-background">
                              <SelectValue placeholder={t("label.technician")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EMPTY_RELATION_VALUE}>—</SelectItem>
                              {technicians.filter((t_) => t_.user_id).map((technician) => (
                                <SelectItem key={technician.id} value={technician.user_id as string}>
                                  <span className="font-medium">{technician.name}</span>
                                  {(technician as any).display_code ? (
                                    <span className="ml-2 text-[10px] text-muted-foreground">
                                      {(technician as any).display_code}
                                    </span>
                                  ) : null}
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
                        <TableCell className="text-right text-[10px] text-muted-foreground">—</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px]", paymentBadgeStyle[ps])}>
                            {paymentLabel[ps]}
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
                  const rowAlert = ps !== "paid" ? getRowAlertLevel(o.created_at) : "none";
                  const daysOld = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000);
                  const techName = o.technician_name || o.technicians?.name;
                  // Use DB-persisted values if available, fallback to live calculation
                  const dbPct = (o as any).technician_percentage;
                  const dbEarn = (o as any).technician_earning;
                  const techEarn = (dbPct != null && dbPct > 0)
                    ? { percentage: dbPct, earnings: dbEarn ?? 0 }
                    : getTechEarnings(techName, o.total, earningsMap);
                  return (
                    <TableRow key={o.id} className={cn(paymentTextStyle[ps], alertStyle[rowAlert])}>
                      <TableCell className="w-10">
                        <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggleOne(o.id)} />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          <AlertIcon level={rowAlert} days={daysOld} />
                          {o.client_name || o.clients?.name || "—"}
                        </div>
                      </TableCell>
                      <TableCell>{o.platform || "—"}</TableCell>
                      <TableCell>{o.technician_name || o.technicians?.name || "—"}</TableCell>
                      <TableCell>{o.week || "—"}</TableCell>
                      <TableCell>{o.car_name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{formatLicensePlate(o.license_plate) || "—"}</TableCell>
                      <TableCell>
                        <span className="text-xs">{services.length ? services.join(", ") : "—"}</span>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {o.total != null ? formatCurrency(Number(o.total)) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-[10px] tabular-nums">
                        {techEarn ? (
                          <span className="text-muted-foreground">
                            {techEarn.percentage}% · <span className="text-foreground font-medium">{formatCurrency(techEarn.earnings)}</span>
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px]", paymentBadgeStyle[ps])}>
                          {paymentLabel[ps]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Can permission="service_orders.edit">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(o)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </Can>
                          <Can permission="service_orders.delete">
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
