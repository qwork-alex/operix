import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Pencil, Save, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";

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

export function ServiceOrdersTable({ orders, isLoading }: ServiceOrdersTableProps) {
  const { t, formatCurrency } = useLanguage();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);

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
    mutationFn: async () => {
      if (!editForm) return;
      const { id, ...updates } = editForm;
      const total = (Number(updates.service_1_price) || 0) + (Number(updates.service_2_price) || 0) + (Number(updates.service_3_price) || 0) + (Number(updates.service_4_price) || 0);
      const { error } = await supabase.from("service_orders").update({
        platform: updates.platform || null,
        week: updates.week || null,
        car_name: updates.car_name || null,
        license_plate: updates.license_plate || null,
        service_1_name: updates.service_1_name || null,
        service_1_price: Number(updates.service_1_price) || 0,
        service_2_name: updates.service_2_name || null,
        service_2_price: Number(updates.service_2_price) || 0,
        service_3_name: updates.service_3_name || null,
        service_3_price: Number(updates.service_3_price) || 0,
        service_4_name: updates.service_4_name || null,
        service_4_price: Number(updates.service_4_price) || 0,
        total,
        status: updates.status || "draft",
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      setEditOpen(false);
      setEditForm(null);
      toast.success(t("toast.updated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const startEdit = (o: ServiceOrderRow) => {
    setEditForm({
      id: o.id,
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
      status: o.status,
    });
    setEditOpen(true);
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
    <>
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditForm(null); }}>
        <DialogContent className="bg-card border-border max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("action.edit")}</DialogTitle></DialogHeader>
          {editForm && (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">{t("label.platform")}</Label><Input value={editForm.platform} onChange={e => setEditForm((p: any) => ({ ...p, platform: e.target.value }))} /></div>
                <div className="space-y-1"><Label className="text-xs">{t("label.week")}</Label><Input value={editForm.week} onChange={e => setEditForm((p: any) => ({ ...p, week: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">{t("label.car")}</Label><Input value={editForm.car_name} onChange={e => setEditForm((p: any) => ({ ...p, car_name: e.target.value }))} /></div>
                <div className="space-y-1"><Label className="text-xs">{t("label.plate")}</Label><Input value={editForm.license_plate} onChange={e => setEditForm((p: any) => ({ ...p, license_plate: e.target.value }))} /></div>
              </div>
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1"><Label className="text-xs">Service {i}</Label><Input value={editForm[`service_${i}_name`]} onChange={e => setEditForm((p: any) => ({ ...p, [`service_${i}_name`]: e.target.value }))} /></div>
                  <div className="space-y-1"><Label className="text-xs">€</Label><Input type="number" step="0.01" value={editForm[`service_${i}_price`]} onChange={e => setEditForm((p: any) => ({ ...p, [`service_${i}_price`]: e.target.value }))} /></div>
                </div>
              ))}
              <Button className="w-full" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                {t("action.save")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
              const services = [
                o.service_1_name,
                o.service_2_name,
                o.service_3_name,
                o.service_4_name,
              ].filter(Boolean);
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
