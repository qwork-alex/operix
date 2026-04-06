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
import { Plus, Save, Trash2, Pencil, Loader2 } from "lucide-react";

interface VehicleForm {
  license_plate: string;
  brand: string;
  model: string;
  year: string;
  fuel_type: string;
  power: string;
  vin_number: string;
  first_registration_date: string;
  vehicle_type: string;
}

const emptyForm: VehicleForm = {
  license_plate: "", brand: "", model: "", year: "", fuel_type: "",
  power: "", vin_number: "", first_registration_date: "", vehicle_type: "private",
};

const STATUS_CYCLE = ["available", "in_use", "maintenance", "inactive"] as const;

const statusConfig: Record<string, { label: string; bg: string; text: string; ring: string }> = {
  available: { label: "Disponível", bg: "bg-green-500/10", text: "text-green-500", ring: "ring-green-500/20" },
  in_use: { label: "Em uso", bg: "bg-blue-500/10", text: "text-blue-400", ring: "ring-blue-500/20" },
  maintenance: { label: "Manutenção", bg: "bg-orange-500/10", text: "text-orange-400", ring: "ring-orange-500/20" },
  inactive: { label: "Inativo", bg: "bg-foreground/90", text: "text-background font-bold", ring: "ring-foreground/50" },
};

export default function VehiclesModule() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyForm);

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["fleet_vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: `${form.brand} ${form.model}`.trim() || form.license_plate,
        license_plate: form.license_plate,
        brand: form.brand || null,
        model: form.model || null,
        year: form.year ? parseInt(form.year) : null,
        fuel_type: form.fuel_type || null,
        power: form.power || null,
        vin_number: form.vin_number || null,
        first_registration_date: form.first_registration_date || null,
        vehicle_type: form.vehicle_type || "private",
      };
      if (editId) {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vehicles").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_vehicles"] });
      close();
      toast.success(editId ? "Veículo atualizado" : "Veículo adicionado");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet_vehicles"] }); toast.success("Removido"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const changeStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("vehicles").update({ status } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet_vehicles"] }); },
  });

  const cycleStatus = (v: any) => {
    const current = v.status || "available";
    const idx = STATUS_CYCLE.indexOf(current as any);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    changeStatus.mutate({ id: v.id, status: next });
  };

  const close = () => { setOpen(false); setEditId(null); setForm(emptyForm); };

  const startEdit = (v: any) => {
    setEditId(v.id);
    setForm({
      license_plate: v.license_plate || "", brand: v.brand || "", model: v.model || "",
      year: v.year ? String(v.year) : "", fuel_type: v.fuel_type || "", power: v.power || "",
      vin_number: v.vin_number || "", first_registration_date: v.first_registration_date || "",
      vehicle_type: v.vehicle_type || "private",
    });
    setOpen(true);
  };

  const set = (k: keyof VehicleForm, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold">Veículos</h2>
          <p className="text-xs text-muted-foreground">Registo de veículos da frota</p>
        </div>
        <Button size="sm" onClick={() => { setForm(emptyForm); setEditId(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Veículo
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matrícula</TableHead>
                <TableHead>Marca / Modelo</TableHead>
                <TableHead>Ano</TableHead>
                <TableHead>Combustível</TableHead>
                <TableHead>VIN</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : vehicles.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum veículo registrado</TableCell></TableRow>
              ) : vehicles.map((v: any) => {
                const st = statusConfig[v.status || "available"] || statusConfig.available;
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono font-semibold">{v.license_plate}</TableCell>
                    <TableCell>{v.brand} {v.model}</TableCell>
                    <TableCell>{v.year || "—"}</TableCell>
                    <TableCell className="capitalize">{v.fuel_type || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{v.vin_number || "—"}</TableCell>
                    <TableCell className="capitalize">{v.vehicle_type === "utility" ? "Utilitário" : "Privado"}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => cycleStatus(v)}
                        className={`
                          inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium
                          ring-1 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95
                          ${st.bg} ${st.text} ${st.ring}
                        `}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${
                          v.status === "available" ? "bg-green-500" :
                          v.status === "in_use" ? "bg-blue-500" :
                          v.status === "maintenance" ? "bg-orange-500" : "bg-muted-foreground"
                        }`} />
                        {st.label}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(v)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(v.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { if (!o) close(); else setOpen(true); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Veículo" : "Novo Veículo"}</DialogTitle>
            <DialogDescription>Preencha os dados do veículo. Campos com * são obrigatórios.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Matrícula *</Label><Input value={form.license_plate} onChange={e => set("license_plate", e.target.value)} placeholder="AA-00-BB" /></div>
            <div><Label>VIN</Label><Input value={form.vin_number} onChange={e => set("vin_number", e.target.value)} placeholder="VIN" /></div>
            <div><Label>Marca</Label><Input value={form.brand} onChange={e => set("brand", e.target.value)} placeholder="Renault" /></div>
            <div><Label>Modelo</Label><Input value={form.model} onChange={e => set("model", e.target.value)} placeholder="Clio" /></div>
            <div><Label>Ano</Label><Input type="number" value={form.year} onChange={e => set("year", e.target.value)} /></div>
            <div><Label>Potência (cv)</Label><Input value={form.power} onChange={e => set("power", e.target.value)} /></div>
            <div>
              <Label>Combustível</Label>
              <Select value={form.fuel_type} onValueChange={v => set("fuel_type", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="gasoline">Gasolina</SelectItem>
                  <SelectItem value="electric">Elétrico</SelectItem>
                  <SelectItem value="hybrid">Híbrido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.vehicle_type} onValueChange={v => set("vehicle_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Privado</SelectItem>
                  <SelectItem value="utility">Utilitário</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>1ª Matrícula</Label><Input type="date" value={form.first_registration_date} onChange={e => set("first_registration_date", e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={close}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!form.license_plate || save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
