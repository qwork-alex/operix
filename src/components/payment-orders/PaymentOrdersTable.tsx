import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Pencil, Save, X, Loader2, Plus } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface PaymentOrderRow {
  id: string;
  clients?: { name: string } | null;
  platform: string | null;
  list_name: string | null;
  technicians?: { name: string } | null;
  car_name: string | null;
  license_plate: string | null;
  services: Json | null;
  total: number | null;
  status: string;
}

const statusStyle: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  matched: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  mismatch: "bg-red-500/10 text-red-400 border-red-500/30",
};

interface EditState {
  platform: string;
  list_name: string;
  car_name: string;
  license_plate: string;
  services: { name: string; price: number }[];
}

export function PaymentOrdersTable({ orders, isLoading }: { orders: PaymentOrderRow[]; isLoading: boolean }) {
  const { t, formatCurrency } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditState | null>(null);

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

      const { data: existing, error: existingError } = await supabase
        .from("payment_orders")
        .select("created_by, created_at")
        .eq("id", id)
        .single();
      if (existingError) throw existingError;

      const created_by = existing.created_by ?? user?.id;
      const created_at = existing.created_at ?? new Date().toISOString();
      const updated_at = new Date().toISOString();

      if (!id || !created_by || !created_at || !updated_at) {
        throw new Error("Missing required audit fields (created_by, created_at, updated_at).");
      }

      const services = editForm.services.filter(s => s.name);
      const total = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
      const payload = {
        platform: editForm.platform || null,
        list_name: editForm.list_name || null,
        car_name: editForm.car_name || null,
        license_plate: editForm.license_plate || null,
        services: services as unknown as Json,
        total,
        created_by,
        created_at,
        updated_at,
      };

      console.log("Saving payload:", payload);

      const { error } = await supabase.from("payment_orders").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_orders"] });
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
      platform: o.platform || "",
      list_name: o.list_name || "",
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
    setEditForm(prev => {
      if (!prev) return prev;
      const updated = [...prev.services];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, services: updated };
    });
  };

  const addService = () => {
    setEditForm(prev => prev ? { ...prev, services: [...prev.services, { name: "", price: 0 }] } : prev);
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
              const computedTotal = editForm.services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
              return (
                <TableRow key={o.id} className="bg-primary/5 text-xs">
                  <TableCell className="font-medium">{(o.clients as any)?.name || "—"}</TableCell>
                  <TableCell className="p-1">
                    <Input className="h-7 text-xs" value={editForm.platform} onChange={e => setEditForm(p => p ? { ...p, platform: e.target.value } : p)} />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input className="h-7 text-xs" value={editForm.list_name} onChange={e => setEditForm(p => p ? { ...p, list_name: e.target.value } : p)} />
                  </TableCell>
                  <TableCell>{(o.technicians as any)?.name || "—"}</TableCell>
                  <TableCell className="p-1">
                    <Input className="h-7 text-xs" value={editForm.car_name} onChange={e => setEditForm(p => p ? { ...p, car_name: e.target.value } : p)} />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input className="h-7 text-xs w-24 font-mono" value={editForm.license_plate} onChange={e => setEditForm(p => p ? { ...p, license_plate: e.target.value } : p)} />
                  </TableCell>
                  <TableCell className="p-1">
                    <div className="space-y-1">
                      {editForm.services.map((s, si) => (
                        <div key={si} className="flex gap-1">
                          <Input
                            className="h-6 text-[11px] px-1 w-20"
                            value={s.name}
                            placeholder={t("extract.serviceName")}
                            onChange={e => updateService(si, "name", e.target.value)}
                          />
                          <Input
                            className="h-6 text-[11px] px-1 w-14 text-right tabular-nums"
                            type="number"
                            step="0.01"
                            value={s.price}
                            onChange={e => updateService(si, "price", Number(e.target.value) || 0)}
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

            const services = Array.isArray(o.services) ? o.services as { name: string; price: number }[] : [];
            return (
              <TableRow key={o.id} className="text-xs">
                <TableCell className="font-medium">{(o.clients as any)?.name || "—"}</TableCell>
                <TableCell>{o.platform || "—"}</TableCell>
                <TableCell>{o.list_name || "—"}</TableCell>
                <TableCell>{(o.technicians as any)?.name || "—"}</TableCell>
                <TableCell>{o.car_name || "—"}</TableCell>
                <TableCell className="font-mono text-[11px]">{o.license_plate || "—"}</TableCell>
                <TableCell className="max-w-[180px] truncate">
                  {services.map(s => s.name).join(", ") || "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatCurrency(o.total || 0)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusStyle[o.status] || statusStyle.pending}>
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
