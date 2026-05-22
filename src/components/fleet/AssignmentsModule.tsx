import { useState } from "react";
import { TableLoadingRow } from "@/components/shared/TableStatusRows";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Save, Trash2, CheckCircle, Loader2 } from "lucide-react";

export default function AssignmentsModule() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vehicle_id: "", driver_id: "", start_date: new Date().toISOString().slice(0, 10) });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["fleet_vehicles"],
    queryFn: async () => { const { data } = await supabase.from("vehicles").select("*").order("license_plate"); return data || []; },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["fleet_drivers"],
    queryFn: async () => { const { data } = await supabase.from("drivers" as any).select("*").eq("status", "active").order("full_name"); return (data || []) as any[]; },
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["fleet_assignments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicle_assignments" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const getVehicleLabel = (id: string) => {
    const v = vehicles.find((x: any) => x.id === id);
    return v ? `${v.brand || ""} ${v.model || ""} — ${v.license_plate}`.trim() : "—";
  };

  const getDriverName = (id: string) => {
    const d = drivers.find((x: any) => x.id === id);
    return d ? d.full_name : "—";
  };

  const save = useMutation({
    mutationFn: async () => {
      // Check no active assignment for this vehicle
      const existing = assignments.find((a: any) => a.vehicle_id === form.vehicle_id && a.status === "em_uso");
      if (existing) throw new Error("Este veículo já tem uma atribuição ativa. Finalize-a primeiro.");

      const driver = drivers.find((d: any) => d.id === form.driver_id);
      const { error } = await supabase.from("vehicle_assignments" as any).insert({
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id,
        driver_name: driver?.full_name || "",
        start_date: form.start_date,
        status: "em_uso",
      });
      if (error) throw error;

      // Update vehicle status
      await supabase.from("vehicles").update({ status: "in_use" } as any).eq("id", form.vehicle_id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_assignments"] });
      qc.invalidateQueries({ queryKey: ["fleet_vehicles"] });
      setOpen(false);
      setForm({ vehicle_id: "", driver_id: "", start_date: new Date().toISOString().slice(0, 10) });
      toast.success("Atribuição criada");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const finalize = useMutation({
    mutationFn: async (a: any) => {
      const { error } = await supabase.from("vehicle_assignments" as any).update({
        status: "finalizado", end_date: new Date().toISOString().slice(0, 10),
      }).eq("id", a.id);
      if (error) throw error;

      // Check if vehicle has other active assignments
      const others = assignments.filter((x: any) => x.vehicle_id === a.vehicle_id && x.id !== a.id && x.status === "em_uso");
      if (others.length === 0) {
        await supabase.from("vehicles").update({ status: "available" } as any).eq("id", a.vehicle_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_assignments"] });
      qc.invalidateQueries({ queryKey: ["fleet_vehicles"] });
      toast.success("Atribuição finalizada");
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicle_assignments" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet_assignments"] }); toast.success("Removido"); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold">Atribuições</h2>
          <p className="text-xs text-muted-foreground">Ligação condutor ↔ veículo com histórico</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova Atribuição
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Veículo</TableHead>
                <TableHead>Condutor</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableLoadingRow colSpan={6} />
              ) : assignments.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma atribuição</TableCell></TableRow>
              ) : assignments.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell>{getVehicleLabel(a.vehicle_id)}</TableCell>
                  <TableCell>{a.driver_id ? getDriverName(a.driver_id) : a.driver_name}</TableCell>
                  <TableCell>{a.start_date}</TableCell>
                  <TableCell>{a.end_date || "—"}</TableCell>
                  <TableCell>
                    <Badge className={a.status === "em_uso" ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"}>
                      {a.status === "em_uso" ? "Ativo" : "Finalizado"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {a.status === "em_uso" && (
                      <Button variant="outline" size="sm" onClick={() => finalize.mutate(a)}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Finalizar
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(a.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Atribuição</DialogTitle>
            <DialogDescription>Atribua um condutor a um veículo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Veículo *</Label>
              <Select value={form.vehicle_id} onValueChange={v => setForm(p => ({ ...p, vehicle_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar veículo" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>{v.brand} {v.model} — {v.license_plate}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Condutor *</Label>
              <Select value={form.driver_id} onValueChange={v => setForm(p => ({ ...p, driver_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar condutor" /></SelectTrigger>
                <SelectContent>
                  {drivers.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Data Início</Label><Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!form.vehicle_id || !form.driver_id || save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
