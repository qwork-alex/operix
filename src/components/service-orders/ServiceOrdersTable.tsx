import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Pencil, Save, X, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ServiceOrderRow {
  id: string;
  client_id: string | null;
  platform: string | null;
  technician_id: string | null;
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
  platform: string;
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

export function ServiceOrdersTable({ orders, isLoading }: ServiceOrdersTableProps) {
  const { t, formatCurrency } = useLanguage();
  const { user } = useAuth();
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

      // Inline validation
      const total = (Number(editForm.service_1_price) || 0) + (Number(editForm.service_2_price) || 0) + (Number(editForm.service_3_price) || 0) + (Number(editForm.service_4_price) || 0);
      if (total === 0) {
        throw new Error(t("validate.inlineError") + ": " + t("validate.zeroTotal").replace("{n}", ""));
      }

      // Fetch FULL existing record to merge
      const { data: existing, error: existingError } = await supabase
        .from("service_orders")
        .select("*")
        .eq("id", id)
        .single();
      if (existingError) throw existingError;

      // Block save if client or technician would be lost
      if (!existing.client_id) {
        throw new Error("Cannot save: client is missing on this record.");
      }
      if (!existing.technician_id) {
        throw new Error("Cannot save: technician is missing on this record.");
      }

      // Merge existing data + edited fields — no field disappears
      const payload = {
        ...existing,
        platform: editForm.platform || existing.platform,
        week: editForm.week || existing.week,
        car_name: editForm.car_name || existing.car_name,
        license_plate: editForm.license_plate || existing.license_plate,
        service_1_name: editForm.service_1_name || existing.service_1_name,
        service_1_price: Number(editForm.service_1_price) || 0,
        service_2_name: editForm.service_2_name || existing.service_2_name,
        service_2_price: Number(editForm.service_2_price) || 0,
        service_3_name: editForm.service_3_name || existing.service_3_name,
        service_3_price: Number(editForm.service_3_price) || 0,
        service_4_name: editForm.service_4_name || existing.service_4_name,
        service_4_price: Number(editForm.service_4_price) || 0,
        total,
        created_by: existing.created_by ?? user?.id,
        created_at: existing.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Remove joined relations before sending to DB
      delete (payload as any).clients;
      delete (payload as any).technicians;

      console.log("Saving payload:", payload);

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
      platform: o.platform || "",
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
    setEditForm(prev => prev ? { ...prev, [field]: value } : prev);
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
              const computedTotal = (Number(editForm.service_1_price) || 0) + (Number(editForm.service_2_price) || 0) + (Number(editForm.service_3_price) || 0) + (Number(editForm.service_4_price) || 0);
              return (
                <TableRow key={o.id} className="bg-primary/5">
                  <TableCell className="font-medium text-xs">{(o as any).clients?.name || "—"}</TableCell>
                  <TableCell className="p-1">
                    <Input className="h-7 text-xs" value={editForm.platform} onChange={e => updateField("platform", e.target.value)} />
                  </TableCell>
                  <TableCell className="text-xs">{(o as any).technicians?.name || "—"}</TableCell>
                  <TableCell className="p-1">
                    <Input className="h-7 text-xs w-16" value={editForm.week} onChange={e => updateField("week", e.target.value)} />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input className="h-7 text-xs" value={editForm.car_name} onChange={e => updateField("car_name", e.target.value)} />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input className="h-7 text-xs w-24 font-mono" value={editForm.license_plate} onChange={e => updateField("license_plate", e.target.value)} />
                  </TableCell>
                  <TableCell className="p-1">
                    <div className="space-y-1">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="flex gap-1">
                          <Input
                            className="h-6 text-[11px] px-1 w-20"
                            value={(editForm as any)[`service_${i}_name`]}
                            placeholder={`S${i}`}
                            onChange={e => updateField(`service_${i}_name` as keyof EditState, e.target.value)}
                          />
                          <Input
                            className="h-6 text-[11px] px-1 w-14 text-right tabular-nums"
                            type="number"
                            step="0.01"
                            value={(editForm as any)[`service_${i}_price`]}
                            onChange={e => updateField(`service_${i}_price` as keyof EditState, Number(e.target.value) || 0)}
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
                <TableCell className="font-medium">{(o as any).clients?.name || "—"}</TableCell>
                <TableCell>{o.platform || "—"}</TableCell>
                <TableCell>{(o as any).technicians?.name || "—"}</TableCell>
                <TableCell>{o.week || "—"}</TableCell>
                <TableCell>{o.car_name || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{o.license_plate || "—"}</TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {services.length ? services.join(", ") : "—"}
                  </span>
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
