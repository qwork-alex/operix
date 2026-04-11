import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useClients, useTechnicians } from "@/hooks/useServiceOrders";
import { toast } from "sonner";
import { formatLicensePlate } from "@/lib/formatPlate";
import { cn } from "@/lib/utils";
import { getRowAlertLevel, type AlertLevel } from "@/hooks/useAgingAlerts";
import { AlertTriangle, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BulkDeleteDialog } from "@/components/shared/BulkDeleteDialog";

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

type PaymentStatus = "paid" | "partial" | "pending" | "none";

const paymentTextStyle: Record<PaymentStatus, string> = {
  paid: "text-emerald-400",
  partial: "text-amber-400",
  pending: "text-red-400",
  none: "",
};

const paymentBadgeStyle: Record<PaymentStatus, string> = {
  paid: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  partial: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  pending: "bg-red-500/10 text-red-500 border-red-500/30",
  none: "bg-muted text-muted-foreground",
};

const paymentLabel: Record<PaymentStatus, string> = {
  paid: "Pago",
  partial: "Parcial",
  pending: "Pendente",
  none: "Sem pagamento",
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch payment statuses — match by BOTH service_order_id AND by week (list_name) + license_plate
  const soIds = orders.map(o => o.id);
  const weeks = [...new Set(orders.map(o => o.week).filter(Boolean))];

  const { data: paymentMap = {} } = useQuery({
    queryKey: ["payment_status_map", soIds, weeks],
    queryFn: async () => {
      if (!soIds.length) return {};

      // Fetch all payment orders that match by service_order_id OR by list_name (week)
      const queries: Promise<any>[] = [];

      // Query 1: By service_order_id
      queries.push(
        supabase
          .from("payment_orders")
          .select("service_order_id, status, list_name, license_plate")
          .in("service_order_id", soIds)
      );

      // Query 2: By week (list_name) for cross-matching
      if (weeks.length > 0) {
        queries.push(
          supabase
            .from("payment_orders")
            .select("service_order_id, status, list_name, license_plate")
            .in("list_name", weeks as string[])
        );
      }

      const results = await Promise.all(queries);
      const allPOs: { service_order_id: string | null; status: string; list_name: string | null; license_plate: string | null }[] = [];

      for (const res of results) {
        if (res.data) allPOs.push(...res.data);
      }

      // Deduplicate
      const seen = new Set<string>();
      const uniquePOs = allPOs.filter(po => {
        const key = `${po.service_order_id}-${po.list_name}-${po.license_plate}-${po.status}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const map: Record<string, PaymentStatus> = {};

      for (const so of orders) {
        // Find matching POs: by service_order_id OR by week + plate
        const normalizedSOPlate = (so.license_plate || "").replace(/[\s\-]/g, "").toUpperCase();

        const matchingPOs = uniquePOs.filter(po => {
          // Match by direct link
          if (po.service_order_id === so.id) return true;
          // Match by week + plate
          if (so.week && po.list_name === so.week && normalizedSOPlate) {
            const normalizedPOPlate = (po.license_plate || "").replace(/[\s\-]/g, "").toUpperCase();
            return normalizedPOPlate === normalizedSOPlate;
          }
          return false;
        });

        if (!matchingPOs.length) continue;

        const allPaid = matchingPOs.every(po => po.status === "paid");
        const allPending = matchingPOs.every(po => po.status === "pending");
        if (allPaid) map[so.id] = "paid";
        else if (allPending) map[so.id] = "pending";
        else map[so.id] = "partial";
      }

      return map;
    },
    enabled: soIds.length > 0,
  });

  const getPaymentStatus = (soId: string): PaymentStatus => paymentMap[soId] || "none";

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
    const statuses = weekOrders.map(o => getPaymentStatus(o.id));
    const allPaid = statuses.every(s => s === "paid");
    const allPending = statuses.every(s => s === "pending" || s === "none");
    if (allPaid) return "paid";
    if (allPending) return "pending";
    return "partial";
  };

  const groupStatusLabel: Record<PaymentStatus, string> = {
    paid: "✓ Pago",
    partial: "◐ Parcial",
    pending: "● Pendente",
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
        created_by: existing.created_by ?? user?.id ?? null,
        created_at: existing.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      delete (payload as any).clients;
      delete (payload as any).technicians;

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
                  <TableHead>Pagamento</TableHead>
                  <TableHead>{t("label.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.orders.map((o) => {
                  const isEditing = editingId === o.id && editForm;
                  const ps = getPaymentStatus(o.id);

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
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px]", paymentBadgeStyle[ps])}>
                          {paymentLabel[ps]}
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
