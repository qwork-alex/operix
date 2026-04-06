import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Save, Trash2, Pencil, Loader2 } from "lucide-react";

interface DriverForm {
  full_name: string;
  birth_date: string;
  phone: string;
  email: string;
  // Structured address
  addr_number: string;
  addr_street: string;
  addr_postal_code: string;
  addr_city: string;
  addr_region: string;
  addr_country: string;
  // License
  license_category: string;
  license_number: string;
  license_expiry_date: string;
}

const emptyForm: DriverForm = {
  full_name: "", birth_date: "", phone: "", email: "",
  addr_number: "", addr_street: "", addr_postal_code: "", addr_city: "", addr_region: "", addr_country: "Portugal",
  license_category: "", license_number: "", license_expiry_date: "",
};

function calcAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const today = new Date();
  const bd = new Date(birthDate);
  let age = today.getFullYear() - bd.getFullYear();
  if (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) age--;
  return age;
}

function parseAddress(address: string): Partial<DriverForm> {
  // Try to parse existing address string into structured fields
  if (!address) return {};
  const parts = address.split(",").map(s => s.trim());
  if (parts.length >= 3) {
    return { addr_street: parts[0], addr_postal_code: parts[1]?.match(/\d{4}-?\d{3}/)?.[0] || "", addr_city: parts[parts.length - 1] };
  }
  return { addr_street: address };
}

function buildAddress(form: DriverForm): string {
  const parts = [
    form.addr_number && form.addr_street ? `${form.addr_street} ${form.addr_number}` : form.addr_street,
    form.addr_postal_code,
    form.addr_city,
    form.addr_region,
    form.addr_country !== "Portugal" ? form.addr_country : "",
  ].filter(Boolean);
  return parts.join(", ");
}

export default function DriversModule() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<DriverForm>(emptyForm);

  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ["fleet_drivers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        full_name: form.full_name,
        birth_date: form.birth_date || null,
        address: buildAddress(form) || null,
        license_category: form.license_category || null,
        license_number: form.license_number || null,
        license_expiry_date: form.license_expiry_date || null,
        phone: form.phone || null,
        email: form.email || null,
      };
      if (editId) {
        const { error } = await supabase.from("drivers").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("drivers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_drivers"] });
      closeDialog();
      toast.success(editId ? "Condutor atualizado" : "Condutor adicionado");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("drivers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet_drivers"] }); toast.success("Removido"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const closeDialog = () => { setOpen(false); setEditId(null); setForm(emptyForm); };

  const startEdit = (d: any) => {
    setEditId(d.id);
    const parsed = parseAddress(d.address || "");
    setForm({
      full_name: d.full_name || "", birth_date: d.birth_date || "",
      phone: d.phone || "", email: d.email || "",
      addr_number: parsed.addr_number || "", addr_street: parsed.addr_street || "",
      addr_postal_code: parsed.addr_postal_code || "", addr_city: parsed.addr_city || "",
      addr_region: parsed.addr_region || "", addr_country: parsed.addr_country || "Portugal",
      license_category: d.license_category || "", license_number: d.license_number || "",
      license_expiry_date: d.license_expiry_date || "",
    });
    setOpen(true);
  };

  const set = (k: keyof DriverForm, v: string) => setForm(p => ({ ...p, [k]: v }));

  const isExpired = (d: string) => d && new Date(d) < new Date();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold">Condutores</h2>
          <p className="text-xs text-muted-foreground">Registo de condutores autorizados</p>
        </div>
        <Button size="sm" onClick={() => { setForm(emptyForm); setEditId(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Condutor
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Idade</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Nº Carta</TableHead>
                <TableHead>Validade Carta</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : drivers.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum condutor registrado</TableCell></TableRow>
              ) : drivers.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="font-semibold">{d.full_name}</TableCell>
                  <TableCell>{calcAge(d.birth_date) ?? "—"}</TableCell>
                  <TableCell>{d.license_category || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{d.license_number || "—"}</TableCell>
                  <TableCell>
                    {d.license_expiry_date ? (
                      <Badge className={isExpired(d.license_expiry_date) ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-500"}>
                        {d.license_expiry_date}
                      </Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell>{d.phone || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(d.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Condutor" : "Novo Condutor"}</DialogTitle>
            <DialogDescription>Preencha os dados do condutor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Personal */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome Completo *</Label><Input value={form.full_name} onChange={e => set("full_name", e.target.value)} /></div>
              <div><Label>Data de Nascimento</Label><Input type="date" value={form.birth_date} onChange={e => set("birth_date", e.target.value)} /></div>
              <div><Label>Telefone</Label><Input value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
              <div className="col-span-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => set("email", e.target.value)} /></div>
            </div>

            {/* Structured Address */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Morada</p>
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-3"><Label className="text-xs">Rua</Label><Input value={form.addr_street} onChange={e => set("addr_street", e.target.value)} placeholder="Rua da Liberdade" className="text-sm" /></div>
                <div><Label className="text-xs">Nº</Label><Input value={form.addr_number} onChange={e => set("addr_number", e.target.value)} placeholder="12" className="text-sm" /></div>
                <div><Label className="text-xs">Código Postal</Label><Input value={form.addr_postal_code} onChange={e => set("addr_postal_code", e.target.value)} placeholder="1000-001" className="text-sm" /></div>
                <div><Label className="text-xs">Cidade</Label><Input value={form.addr_city} onChange={e => set("addr_city", e.target.value)} placeholder="Lisboa" className="text-sm" /></div>
                <div><Label className="text-xs">Região</Label><Input value={form.addr_region} onChange={e => set("addr_region", e.target.value)} placeholder="Lisboa" className="text-sm" /></div>
                <div><Label className="text-xs">País</Label><Input value={form.addr_country} onChange={e => set("addr_country", e.target.value)} className="text-sm" /></div>
              </div>
            </div>

            {/* License */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Carta de Condução</p>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">Categoria</Label><Input value={form.license_category} onChange={e => set("license_category", e.target.value)} placeholder="B, C, D..." className="text-sm" /></div>
                <div><Label className="text-xs">Nº Carta</Label><Input value={form.license_number} onChange={e => set("license_number", e.target.value)} className="text-sm" /></div>
                <div><Label className="text-xs">Validade</Label><Input type="date" value={form.license_expiry_date} onChange={e => set("license_expiry_date", e.target.value)} className="text-sm" /></div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!form.full_name || save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
