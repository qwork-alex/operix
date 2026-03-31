import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Pencil, Save, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
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

export function PaymentOrdersTable({ orders, isLoading }: { orders: PaymentOrderRow[]; isLoading: boolean }) {
  const { t, formatCurrency } = useLanguage();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);

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
    mutationFn: async () => {
      if (!editForm) return;
      const services = (editForm.services || []).filter((s: any) => s.name);
      const total = services.reduce((sum: number, s: any) => sum + (Number(s.price) || 0), 0);
      const { error } = await supabase.from("payment_orders").update({
        platform: editForm.platform || null,
        list_name: editForm.list_name || null,
        car_name: editForm.car_name || null,
        license_plate: editForm.license_plate || null,
        services: services as unknown as Json,
        total,
        status: editForm.status || "pending",
      }).eq("id", editForm.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      setEditOpen(false);
      setEditForm(null);
      toast.success(t("toast.updated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const startEdit = (o: PaymentOrderRow) => {
    const services = Array.isArray(o.services) ? (o.services as { name: string; price: number }[]) : [];
    setEditForm({
      id: o.id,
      platform: o.platform || "",
      list_name: o.list_name || "",
      car_name: o.car_name || "",
      license_plate: o.license_plate || "",
      services: services.length > 0 ? services : [{ name: "", price: 0 }],
      status: o.status,
    });
    setEditOpen(true);
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
    <>
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditForm(null); }}>
        <DialogContent className="bg-card border-border max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("action.edit")}</DialogTitle></DialogHeader>
          {editForm && (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">{t("label.platform")}</Label><Input value={editForm.platform} onChange={e => setEditForm((p: any) => ({ ...p, platform: e.target.value }))} /></div>
                <div className="space-y-1"><Label className="text-xs">{t("label.list")}</Label><Input value={editForm.list_name} onChange={e => setEditForm((p: any) => ({ ...p, list_name: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">{t("label.car")}</Label><Input value={editForm.car_name} onChange={e => setEditForm((p: any) => ({ ...p, car_name: e.target.value }))} /></div>
                <div className="space-y-1"><Label className="text-xs">{t("label.plate")}</Label><Input value={editForm.license_plate} onChange={e => setEditForm((p: any) => ({ ...p, license_plate: e.target.value }))} /></div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("label.services")}</Label>
                {editForm.services.map((s: any, i: number) => (
                  <div key={i} className="grid grid-cols-3 gap-2">
                    <div className="col-span-2"><Input value={s.name} placeholder={t("extract.serviceName")} onChange={e => {
                      const updated = [...editForm.services];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setEditForm((p: any) => ({ ...p, services: updated }));
                    }} /></div>
                    <div><Input type="number" step="0.01" value={s.price} onChange={e => {
                      const updated = [...editForm.services];
                      updated[i] = { ...updated[i], price: Number(e.target.value) || 0 };
                      setEditForm((p: any) => ({ ...p, services: updated }));
                    }} /></div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setEditForm((p: any) => ({ ...p, services: [...p.services, { name: "", price: 0 }] }))}>{t("extract.addService")}</Button>
              </div>
              <Button className="w-full" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                {t("action.save")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                      {o.status}
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
    </>
  );
}
