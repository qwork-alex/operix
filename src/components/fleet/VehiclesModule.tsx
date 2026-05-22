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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Save, Trash2, Pencil, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import DocumentCapture from "./DocumentCapture";

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

type ConfidenceLevel = "high" | "medium" | "low";

const confidenceColor = (c?: ConfidenceLevel) => {
  if (!c) return "";
  if (c === "high") return "ring-green-500/30";
  if (c === "medium") return "ring-yellow-500/40";
  return "ring-red-500/50";
};

const confidenceIcon = (c?: ConfidenceLevel) => {
  if (!c) return null;
  if (c === "high") return <CheckCircle2 className="h-3 w-3 text-green-500" />;
  if (c === "medium") return <AlertTriangle className="h-3 w-3 text-yellow-500" />;
  return <AlertTriangle className="h-3 w-3 text-red-500" />;
};

export default function VehiclesModule() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyForm);
  const [extracting, setExtracting] = useState(false);
  const [confidence, setConfidence] = useState<Record<string, ConfidenceLevel>>({});
  const [ocrNotes, setOcrNotes] = useState<string | null>(null);

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
      closeDialog();
      toast.success(editId ? "Veículo atualizado" : "Veículo adicionado");
    },
    onError: (e) => toast.error(`Erro ao salvar veículo: ${(e as Error).message}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet_vehicles"] }); toast.success("Removido"); },
    onError: (e) => toast.error(`Erro ao remover veículo: ${(e as Error).message}`),
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

  const closeDialog = () => {
    setOpen(false); setEditId(null); setForm(emptyForm);
    setConfidence({}); setOcrNotes(null);
  };

  const startEdit = (v: any) => {
    setEditId(v.id);
    setForm({
      license_plate: v.license_plate || "", brand: v.brand || "", model: v.model || "",
      year: v.year ? String(v.year) : "", fuel_type: v.fuel_type || "", power: v.power || "",
      vin_number: v.vin_number || "", first_registration_date: v.first_registration_date || "",
      vehicle_type: v.vehicle_type || "private",
    });
    setConfidence({});
    setOcrNotes(null);
    setOpen(true);
  };

  const set = (k: keyof VehicleForm, v: string) => setForm(p => ({ ...p, [k]: v }));

  /* ─── OCR Extraction ─── */
  const handleFileReady = async (file: File) => {
    if (!file) return;
    setExtracting(true);
    setOcrNotes(null);
    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = () => reject(new Error("Falha ao ler o ficheiro"));
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("extract-fleet-document", {
        body: { imageBase64: base64, mimeType: file.type, documentType: "vehicle" },
      });

      if (error) {
        // Handle specific error types
        const errMsg = error.message || "";
        if (errMsg.includes("non-2xx")) {
          toast.error("Serviço de extração indisponível. Preencha os campos manualmente.");
        } else {
          toast.error(`Erro na extração: ${errMsg}. Preencha manualmente.`);
        }
        return;
      }

      if (data?.error) {
        toast.warning(`Extração parcial: ${data.error}. Verifique os dados.`);
      }

      // Pre-fill form — never overwrite user-entered non-empty values
      setForm(prev => ({
        ...prev,
        license_plate: data?.license_plate || prev.license_plate,
        vin_number: data?.vin_number || prev.vin_number,
        brand: data?.brand || prev.brand,
        model: data?.model || prev.model,
        year: data?.year || prev.year,
        first_registration_date: data?.first_registration_date || prev.first_registration_date,
        fuel_type: data?.fuel_type || prev.fuel_type,
        vehicle_type: data?.vehicle_type || prev.vehicle_type,
        power: data?.power || prev.power,
      }));

      setConfidence(data?.confidence || {});
      setOcrNotes(data?.notes || null);

      // Store document
      const path = `fleet/vehicles/${Date.now()}_${file.name}`;
      await supabase.storage.from("uploads").upload(path, file);
      await supabase.from("documents").insert({
        name: file.name, type: "file", entity_type: "vehicle_document",
        storage_path: path, mime_type: file.type, size_bytes: file.size,
        module: "fleet",
      });

      toast.success("Dados extraídos — verifique e corrija antes de salvar");
    } catch (err) {
      console.error("[VehicleOCR] Extraction failed:", err);
      toast.error("Erro na extração do documento. Os campos estão disponíveis para preenchimento manual.");
    } finally {
      setExtracting(false);
    }
  };

  const hasConfidence = Object.keys(confidence).length > 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold">Veículos</h2>
          <p className="text-xs text-muted-foreground">Registo de veículos da frota</p>
        </div>
        <Button size="sm" onClick={() => { setForm(emptyForm); setEditId(null); setConfidence({}); setOcrNotes(null); setOpen(true); }}>
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
                <TableLoadingRow colSpan={8} />
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
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium ring-1 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 ${st.bg} ${st.text} ${st.ring}`}
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

      <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Veículo" : "Novo Veículo"}</DialogTitle>
            <DialogDescription>Preencha os dados ou importe de um documento.</DialogDescription>
          </DialogHeader>

          {/* OCR Upload Zone — available in BOTH create and edit */}
          <DocumentCapture
            onFileReady={handleFileReady}
            disabled={false}
            extracting={extracting}
            label={editId ? "Reimportar dados do documento" : "Importar dados do documento"}
          />

          {ocrNotes && (
            <p className="text-[10px] text-yellow-500">⚠️ {ocrNotes}</p>
          )}

          {/* Confidence banner */}
          {hasConfidence && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Dados pré-preenchidos por IA.</span> Verifique cada campo antes de salvar. Ícones indicam a confiança da extração.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1">Matrícula * {confidenceIcon(confidence.license_plate)}</Label>
              <Input value={form.license_plate} onChange={e => set("license_plate", e.target.value)} placeholder="AA-00-BB"
                className={confidence.license_plate ? `ring-1 ${confidenceColor(confidence.license_plate)}` : ""} />
            </div>
            <div>
              <Label className="flex items-center gap-1">VIN {confidenceIcon(confidence.vin_number)}</Label>
              <Input value={form.vin_number} onChange={e => set("vin_number", e.target.value)} placeholder="VIN"
                className={confidence.vin_number ? `ring-1 ${confidenceColor(confidence.vin_number)}` : ""} />
            </div>
            <div>
              <Label className="flex items-center gap-1">Marca {confidenceIcon(confidence.brand)}</Label>
              <Input value={form.brand} onChange={e => set("brand", e.target.value)} placeholder="Renault"
                className={confidence.brand ? `ring-1 ${confidenceColor(confidence.brand)}` : ""} />
            </div>
            <div>
              <Label className="flex items-center gap-1">Modelo {confidenceIcon(confidence.model)}</Label>
              <Input value={form.model} onChange={e => set("model", e.target.value)} placeholder="Clio"
                className={confidence.model ? `ring-1 ${confidenceColor(confidence.model)}` : ""} />
            </div>
            <div>
              <Label className="flex items-center gap-1">Ano {confidenceIcon(confidence.year)}</Label>
              <Input type="number" value={form.year} onChange={e => set("year", e.target.value)}
                className={confidence.year ? `ring-1 ${confidenceColor(confidence.year)}` : ""} />
            </div>
            <div>
              <Label>Potência (cv)</Label>
              <Input value={form.power} onChange={e => set("power", e.target.value)} />
            </div>
            <div>
              <Label className="flex items-center gap-1">Combustível {confidenceIcon(confidence.fuel_type)}</Label>
              <Select value={form.fuel_type} onValueChange={v => set("fuel_type", v)}>
                <SelectTrigger className={confidence.fuel_type ? `ring-1 ${confidenceColor(confidence.fuel_type)}` : ""}>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
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
            <div className="col-span-2">
              <Label>1ª Matrícula</Label>
              <Input type="date" value={form.first_registration_date} onChange={e => set("first_registration_date", e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
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
