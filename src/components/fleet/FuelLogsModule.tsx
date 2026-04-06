import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Save, Trash2, Upload, Fuel, Loader2 } from "lucide-react";

export default function FuelLogsModule() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vehicle_id: "", date: new Date().toISOString().slice(0, 10), km_at_fuel: "", liters: "", total_cost: "", notes: "" });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const { data: vehicles = [] } = useQuery({
    queryKey: ["fleet_vehicles"],
    queryFn: async () => { const { data } = await supabase.from("vehicles").select("*").order("license_plate"); return data || []; },
  });

  const { data: fuelLogs = [], isLoading } = useQuery({
    queryKey: ["fleet_fuel_logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fleet_fuel_logs" as any).select("*").order("date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const getVehicleLabel = (id: string) => {
    const v = vehicles.find((x: any) => x.id === id);
    return v ? `${v.brand || ""} ${v.model || ""} — ${v.license_plate}`.trim() : "—";
  };

  const save = useMutation({
    mutationFn: async () => {
      const liters = parseFloat(form.liters);
      const totalCost = parseFloat(form.total_cost);
      if (isNaN(liters) || isNaN(totalCost)) throw new Error("Litros e custo são obrigatórios");

      let receiptPath: string | null = null;
      if (receiptFile) {
        const path = `fleet/fuel/${form.vehicle_id}/${Date.now()}_${receiptFile.name}`;
        const { error: upErr } = await supabase.storage.from("uploads").upload(path, receiptFile);
        if (upErr) throw upErr;
        receiptPath = path;

        // Also store in centralized documents
        const { data: urlData } = await supabase.storage.from("uploads").createSignedUrl(path, 31536000);
        await supabase.from("documents").insert({
          name: receiptFile.name,
          type: "file",
          entity_type: "fuel_receipt",
          storage_path: path,
          mime_type: receiptFile.type,
          size_bytes: receiptFile.size,
        });
      }

      const { error } = await supabase.from("fleet_fuel_logs" as any).insert({
        vehicle_id: form.vehicle_id,
        date: form.date,
        km_at_fuel: form.km_at_fuel ? parseFloat(form.km_at_fuel) : null,
        liters,
        total_cost: totalCost,
        receipt_storage_path: receiptPath,
        notes: form.notes || null,
      });
      if (error) throw error;

      // Sync to accounting
      const vehicle = vehicles.find((v: any) => v.id === form.vehicle_id);
      await supabase.from("financial_records").insert({
        type: "expense",
        source: "fleet",
        category: "fuel",
        amount: totalCost,
        label: `Combustível — ${vehicle?.brand || ""} ${vehicle?.model || ""} ${vehicle?.license_plate || ""}`.trim(),
        notes: `${liters}L @ ${form.km_at_fuel || "?"} km`,
        status: "confirmed",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_fuel_logs"] });
      qc.invalidateQueries({ queryKey: ["financial_records"] });
      closeDialog();
      toast.success("Abastecimento registrado");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (log: any) => {
      if (log.receipt_storage_path) await supabase.storage.from("uploads").remove([log.receipt_storage_path]);
      const { error } = await supabase.from("fleet_fuel_logs" as any).delete().eq("id", log.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet_fuel_logs"] }); toast.success("Removido"); },
  });

  const closeDialog = () => {
    setOpen(false);
    setForm({ vehicle_id: "", date: new Date().toISOString().slice(0, 10), km_at_fuel: "", liters: "", total_cost: "", notes: "" });
    setReceiptFile(null);
  };

  const totalCost = fuelLogs.reduce((s: number, l: any) => s + Number(l.total_cost || 0), 0);
  const totalLiters = fuelLogs.reduce((s: number, l: any) => s + Number(l.liters || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold">Combustível</h2>
          <p className="text-xs text-muted-foreground">
            Total: {totalLiters.toFixed(1)}L — {totalCost.toFixed(2)} €
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo Abastecimento
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>KM</TableHead>
                <TableHead>Litros</TableHead>
                <TableHead>Custo Total</TableHead>
                <TableHead>€/L</TableHead>
                <TableHead>Comprovante</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : fuelLogs.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum registo</TableCell></TableRow>
              ) : fuelLogs.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell>{l.date}</TableCell>
                  <TableCell>{getVehicleLabel(l.vehicle_id)}</TableCell>
                  <TableCell className="tabular-nums">{l.km_at_fuel ? Number(l.km_at_fuel).toLocaleString() : "—"}</TableCell>
                  <TableCell className="tabular-nums">{Number(l.liters).toFixed(1)} L</TableCell>
                  <TableCell className="font-semibold tabular-nums">{Number(l.total_cost).toFixed(2)} €</TableCell>
                  <TableCell className="tabular-nums">{l.price_per_liter ? `${Number(l.price_per_liter).toFixed(3)} €` : "—"}</TableCell>
                  <TableCell>{l.receipt_storage_path ? "✓" : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(l)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); else setOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Abastecimento</DialogTitle>
            <DialogDescription>Registe um abastecimento de combustível.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Veículo *</Label>
              <Select value={form.vehicle_id} onValueChange={v => setForm(p => ({ ...p, vehicle_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.brand} {v.model} — {v.license_plate}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data</Label><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
              <div><Label>KM no abastecimento</Label><Input type="number" value={form.km_at_fuel} onChange={e => setForm(p => ({ ...p, km_at_fuel: e.target.value }))} /></div>
              <div><Label>Litros *</Label><Input type="number" step="0.01" value={form.liters} onChange={e => setForm(p => ({ ...p, liters: e.target.value }))} /></div>
              <div><Label>Custo Total (€) *</Label><Input type="number" step="0.01" value={form.total_cost} onChange={e => setForm(p => ({ ...p, total_cost: e.target.value }))} /></div>
            </div>
            <div><Label>Notas</Label><Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            <div>
              <Label>Comprovante (opcional)</Label>
              <Input type="file" accept="image/*,.pdf" onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!form.vehicle_id || !form.liters || !form.total_cost || save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
