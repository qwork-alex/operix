import { useState, useCallback } from "react";
import { TableLoadingRow } from "@/components/shared/TableStatusRows";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile, deleteFiles } from "@/lib/storage";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Save, Trash2, Pencil, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import DocumentCapture from "./DocumentCapture";
import { withAbortableTimeout, withPromiseTimeout } from "@/lib/asyncGuard";

interface FuelForm {
  vehicle_id: string;
  driver_id: string;
  date: string;
  km_at_fuel: string;
  liters: string;
  total_cost: string;
  price_per_liter: string;
  notes: string;
}

const emptyForm: FuelForm = { vehicle_id: "", driver_id: "", date: new Date().toISOString().slice(0, 10), km_at_fuel: "", liters: "", total_cost: "", price_per_liter: "", notes: "" };

const ACTIVE_TRIP_KEY = "fleet_active_trips";

type ConfidenceLevel = "high" | "medium" | "low";

const confidenceColor = (c?: ConfidenceLevel) => {
  if (c === "high") return "ring-green-400/60";
  if (c === "medium") return "ring-yellow-400/60";
  if (c === "low") return "ring-red-400/60";
  return "";
};

export default function FuelLogsModule() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FuelForm>(emptyForm);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [confidence, setConfidence] = useState<Record<string, ConfidenceLevel>>({});

  const { data: vehicles = [] } = useQuery({
    queryKey: ["fleet_vehicles"],
    queryFn: async () => { const { data } = await supabase.from("vehicles").select("*").order("license_plate"); return data || []; },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["fleet_drivers_min"],
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("id, full_name, linked_user_id").order("full_name");
      return (data || []) as any[];
    },
  });

  const { data: fuelLogs = [], isLoading } = useQuery({
    queryKey: ["fleet_fuel_logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fleet_fuel_logs").select("*").order("date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const getVehicleLabel = (id: string) => {
    const v = vehicles.find((x: any) => x.id === id);
    return v ? `${v.brand || ""} ${v.model || ""} — ${v.license_plate}`.trim() : "—";
  };

  const handleReceiptFile = useCallback(async (file: File) => {
    setReceiptFile(file);
    // Only OCR images, not PDFs
    if (!file.type.startsWith("image/")) return;

    setIsExtracting(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = () => reject(new Error("Falha ao ler ficheiro"));
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("extract-fleet-document", {
        body: { imageBase64: base64, mimeType: file.type, documentType: "fuel_receipt" },
      });

      if (error) {
        const errMsg = error.message || "";
        if (errMsg.includes("non-2xx")) {
          toast.error("Serviço de extração indisponível. Preencha manualmente.");
        } else {
          toast.error(`Erro na extração: ${errMsg}`);
        }
        return;
      }

      if (data?.error) {
        toast.warning(`Extração parcial: ${data.error}`);
      }

      setForm(prev => ({
        ...prev,
        liters: data?.liters ? String(data.liters) : prev.liters,
        total_cost: data?.total_cost ? String(data.total_cost) : prev.total_cost,
        price_per_liter: data?.price_per_liter ? String(data.price_per_liter) : prev.price_per_liter,
        date: data?.date || prev.date,
      }));
      setConfidence(data?.confidence || {});
      toast.success("Dados extraídos do comprovante");
    } catch (err) {
      void err;
      toast.error("Erro na extração. Preencha manualmente.");
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      const liters = parseFloat(form.liters);
      const totalCost = parseFloat(form.total_cost);
      if (!liters || !totalCost || isNaN(liters) || isNaN(totalCost)) throw new Error("Dados inválidos");
      if (!form.vehicle_id) throw new Error("Selecione um veículo");

      const pricePerLiter = totalCost / liters;
      if (!Number.isFinite(pricePerLiter) || pricePerLiter <= 0) throw new Error("Dados inválidos");

      let receiptPath: string | null = null;
      if (receiptFile) {
        const safeName = (receiptFile.name || "document").replace(/[^\w.\-()]+/g, "_").slice(0, 160);
        const path = `fleet/fuel/${form.vehicle_id}/${Date.now()}_${safeName}`;
        await withPromiseTimeout<any>(
          uploadFile("uploads", path, receiptFile, receiptFile.type || undefined),
          10000,
          "fleet_fuel_receipt_upload",
        );
        receiptPath = path;

        const { error: docErr } = await withAbortableTimeout<{ data: any; error: any }>(
          async (signal) =>
            ((supabase as any).from("documents").insert({
              name: safeName,
              type: "file",
              entity_type: "fuel_receipt",
              storage_path: path,
              mime_type: receiptFile.type || null,
              size_bytes: receiptFile.size,
              module: "fleet",
            }) as any).abortSignal(signal),
          10000,
          "fleet_fuel_receipt_insert",
        );
        if (docErr) throw new Error(docErr.message);
      }

      const payload: any = {
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id || null,
        date: form.date,
        km_at_fuel: form.km_at_fuel ? parseFloat(form.km_at_fuel) : null,
        liters,
        total_cost: totalCost,
        notes: form.notes || null,
      };

      if (receiptPath) payload.receipt_storage_path = receiptPath;

      if (editId) {
        const { error } = await withAbortableTimeout<{ data: any; error: any }>(
          async (signal) =>
            ((supabase as any).from("fleet_fuel_logs").update(payload).eq("id", editId) as any).abortSignal(signal),
          12000,
          "fleet_fuel_logs_update",
        );
        if (error) throw error;
      } else {
        const { error } = await withAbortableTimeout<{ data: any; error: any }>(
          async (signal) =>
            ((supabase as any).from("fleet_fuel_logs").insert(payload) as any).abortSignal(signal),
          12000,
          "fleet_fuel_logs_insert",
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_fuel_logs"] });
      qc.invalidateQueries({ queryKey: ["accounting-module", "fuel", "fleet-mirror"] });
      qc.invalidateQueries({ queryKey: ["accounting-expenses-by-period"] });
      closeDialog();
      toast.success(editId ? "Abastecimento atualizado" : "Abastecimento registrado");
    },
    onError: (e) => toast.error(`Erro: ${(e as Error).message}`),
  });

  const remove = useMutation({
    mutationFn: async (log: any) => {
      if (log.receipt_storage_path) {
        await withPromiseTimeout<any>(
          deleteFiles("uploads", [log.receipt_storage_path]),
          10000,
          "fleet_fuel_receipt_remove_storage",
        );
      }
      const { error } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) =>
          ((supabase as any).from("fleet_fuel_logs").delete().eq("id", log.id) as any).abortSignal(signal),
        12000,
        "fleet_fuel_logs_delete",
      );
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet_fuel_logs"] }); toast.success("Removido"); },
  });

  const closeDialog = () => {
    setOpen(false); setEditId(null); setForm(emptyForm); setReceiptFile(null); setConfidence({});
  };

  const startEdit = (l: any) => {
    setEditId(l.id);
    setForm({
      vehicle_id: l.vehicle_id || "", driver_id: l.driver_id || "", date: l.date || new Date().toISOString().slice(0, 10),
      km_at_fuel: l.km_at_fuel ? String(l.km_at_fuel) : "", liters: l.liters ? String(l.liters) : "",
      total_cost: l.total_cost ? String(l.total_cost) : "", price_per_liter: l.price_per_liter ? String(l.price_per_liter) : "",
      notes: l.notes || "",
    });
    setConfidence({});
    setOpen(true);
  };

  const totalCost = fuelLogs.reduce((s: number, l: any) => s + Number(l.total_cost || 0), 0);
  const totalLiters = fuelLogs.reduce((s: number, l: any) => s + Number(l.liters || 0), 0);
  const set = (field: keyof FuelForm, value: string) => setForm(p => ({ ...p, [field]: value }));

  // Active trip indicator
  const hasActiveTrip = (() => {
    try {
      const stored = localStorage.getItem(ACTIVE_TRIP_KEY);
      if (stored) {
        const sessions = JSON.parse(stored);
        return Array.isArray(sessions) && sessions.length > 0;
      }
    } catch { /* ignore */ }
    return false;
  })();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-base font-semibold">Combustível</h2>
            <p className="text-xs text-muted-foreground">Total: {totalLiters.toFixed(1)}L — {totalCost.toFixed(2)} €</p>
          </div>
          {hasActiveTrip && (
            <span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">
              🔗 Trajeto ativo — será vinculado automaticamente
            </span>
          )}
        </div>
        <Button size="sm" onClick={() => { setForm(emptyForm); setEditId(null); setConfidence({}); setOpen(true); }}>
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
                <TableLoadingRow colSpan={8} />
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
                  <TableCell>{l.receipt_storage_path ? <Badge variant="outline" className="text-[10px]">✓</Badge> : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(l)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(l)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Abastecimento" : "Novo Abastecimento"}</DialogTitle>
            <DialogDescription>Registe um abastecimento de combustível.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Smart Upload Zone */}
            <div>
              <Label className="text-xs font-medium mb-1 block">Comprovante</Label>
              {receiptFile ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs flex-1 truncate">{receiptFile.name}</span>
                  {isExtracting && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {!isExtracting && Object.keys(confidence).length > 0 && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setReceiptFile(null); setConfidence({}); }}>Trocar</Button>
                </div>
              ) : (
                <DocumentCapture
                  onFileReady={handleReceiptFile}
                  extracting={isExtracting}
                  label="Scan/foto/ficheiro do comprovante"
                />
              )}
            </div>

            <div>
              <Label>Veículo *</Label>
              <Select value={form.vehicle_id} onValueChange={v => set("vehicle_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.brand} {v.model} — {v.license_plate}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Condutor (opcional)</Label>
              <Select
                value={form.driver_id || "none"}
                onValueChange={(v) => set("driver_id", v === "none" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Sem condutor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem condutor</SelectItem>
                  {drivers.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.full_name}{d.linked_user_id ? " 🔗" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.date} onChange={e => set("date", e.target.value)}
                  className={cn(confidence.date && `ring-2 ${confidenceColor(confidence.date)}`)} />
              </div>
              <div>
                <Label>KM no abastecimento</Label>
                <Input type="number" value={form.km_at_fuel} onChange={e => set("km_at_fuel", e.target.value)} />
              </div>
              <div>
                <Label>Litros *</Label>
                <Input type="number" step="0.01" value={form.liters} onChange={e => set("liters", e.target.value)}
                  className={cn(confidence.liters && `ring-2 ${confidenceColor(confidence.liters)}`)} />
              </div>
              <div>
                <Label>Custo Total (€) *</Label>
                <Input type="number" step="0.01" value={form.total_cost} onChange={e => set("total_cost", e.target.value)}
                  className={cn(confidence.total_cost && `ring-2 ${confidenceColor(confidence.total_cost)}`)} />
              </div>
            </div>
            {form.liters && form.total_cost && parseFloat(form.liters) > 0 && (
              <p className="text-xs text-muted-foreground">
                €/L calculado: {(parseFloat(form.total_cost) / parseFloat(form.liters)).toFixed(3)} €
                {confidence.price_per_liter && (
                  <span className={cn("ml-2 px-1 rounded text-[10px]",
                    confidence.price_per_liter === "high" ? "bg-green-500/10 text-green-600" :
                    confidence.price_per_liter === "medium" ? "bg-yellow-500/10 text-yellow-600" :
                    "bg-red-500/10 text-red-600"
                  )}>OCR</span>
                )}
              </p>
            )}
            <div><Label>Notas</Label><Input value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!form.vehicle_id || !form.liters || !form.total_cost || save.isPending || isExtracting}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
