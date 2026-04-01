import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Car, Plus, Save, Trash2, Upload, Loader2, Pencil, FolderOpen, FileText,
  Eye, Download, Printer, MapPin, Fuel, Route, Users, CalendarDays, BarChart3,
} from "lucide-react";

// ─── TYPES ───
interface VehicleForm {
  license_plate: string;
  brand: string;
  model: string;
  year: string;
  fuel_type: string;
  power: string;
}

const emptyVehicleForm: VehicleForm = { license_plate: "", brand: "", model: "", year: "", fuel_type: "", power: "" };

// ─── WEEKLY GROUPING HELPER ───
function getWeekKey(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - day);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return `${sunday.toISOString().slice(0, 10)} → ${saturday.toISOString().slice(0, 10)}`;
}

export default function FleetPage() {
  const { t, formatDate, formatCurrency } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("vehicles");

  // ─── VEHICLE STATE ───
  const [vOpen, setVOpen] = useState(false);
  const [vEditId, setVEditId] = useState<string | null>(null);
  const [vForm, setVForm] = useState<VehicleForm>(emptyVehicleForm);

  // ─── ASSIGNMENT STATE ───
  const [aOpen, setAOpen] = useState(false);
  const [aForm, setAForm] = useState({ vehicle_id: "", driver_name: "", start_date: new Date().toISOString().slice(0, 10) });

  // ─── USAGE LOG STATE ───
  const [uOpen, setUOpen] = useState(false);
  const [uVehicleId, setUVehicleId] = useState("");
  const [uForm, setUForm] = useState({ driver_name: "", km_start: "", km_end: "", start_location: "", end_location: "", fuel_cost: "", liters: "", date: new Date().toISOString().slice(0, 10) });

  // ─── DOCUMENT STATE ───
  const [docOpen, setDocOpen] = useState(false);
  const [docVehicleId, setDocVehicleId] = useState<string | null>(null);
  const [docType, setDocType] = useState("outros");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");
  const [previewMime, setPreviewMime] = useState("");

  // ─── FUEL RECEIPT STATE ───
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptLogId, setReceiptLogId] = useState<string | null>(null);

  // ─── QUERIES ───
  const { data: vehicles = [], isLoading: vLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["vehicle_assignments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicle_assignments" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: usageLogs = [] } = useQuery({
    queryKey: ["vehicle_usage_logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicle_usage_logs" as any).select("*").order("date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: vehicleDocs = [] } = useQuery({
    queryKey: ["vehicle_documents", docVehicleId],
    queryFn: async () => {
      if (!docVehicleId) return [];
      const { data, error } = await supabase.from("vehicle_documents" as any).select("*").eq("vehicle_id", docVehicleId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!docVehicleId,
  });

  const { data: fuelReceipts = [] } = useQuery({
    queryKey: ["fuel_receipts", receiptLogId],
    queryFn: async () => {
      if (!receiptLogId) return [];
      const { data, error } = await supabase.from("fuel_receipts" as any).select("*").eq("usage_log_id", receiptLogId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!receiptLogId,
  });

  // ─── KPIs ───
  const totalDistance = usageLogs.reduce((s: number, l: any) => s + Math.max(0, Number(l.distance || (Number(l.km_end) - Number(l.km_start))) || 0), 0);
  const totalFuelCost = usageLogs.reduce((s: number, l: any) => s + Number(l.fuel_cost || 0), 0);
  const costPerKm = totalDistance > 0 ? totalFuelCost / totalDistance : 0;
  const activeAssignments = assignments.filter((a: any) => a.status === "em_uso").length;

  // ─── WEEKLY GROUPING ───
  const weeklyData = useMemo(() => {
    const weeks: Record<string, { km: number; fuel: number; trips: number }> = {};
    usageLogs.forEach((l: any) => {
      const key = getWeekKey(l.date);
      if (!weeks[key]) weeks[key] = { km: 0, fuel: 0, trips: 0 };
      weeks[key].km += Math.max(0, Number(l.distance || (Number(l.km_end) - Number(l.km_start))) || 0);
      weeks[key].fuel += Number(l.fuel_cost || 0);
      weeks[key].trips += 1;
    });
    return Object.entries(weeks).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);
  }, [usageLogs]);

  // ─── VEHICLE MUTATIONS ───
  const saveVehicle = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: `${vForm.brand} ${vForm.model}`.trim() || vForm.license_plate,
        license_plate: vForm.license_plate,
        brand: vForm.brand || null,
        model: vForm.model || null,
        year: vForm.year ? parseInt(vForm.year) : null,
        fuel_type: vForm.fuel_type || null,
        power: vForm.power || null,
      };
      if (vEditId) {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", vEditId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vehicles").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setVOpen(false);
      setVEditId(null);
      setVForm(emptyVehicleForm);
      toast.success(vEditId ? t("toast.updated") : t("fleet.vehicleAdded"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteVehicle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success(t("toast.deleted"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const startEditVehicle = (v: any) => {
    setVEditId(v.id);
    setVForm({
      license_plate: v.license_plate || "",
      brand: v.brand || "",
      model: v.model || "",
      year: v.year ? String(v.year) : "",
      fuel_type: v.fuel_type || "",
      power: v.power || "",
    });
    setVOpen(true);
  };

  // ─── ASSIGNMENT MUTATIONS ───
  const saveAssignment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("vehicle_assignments" as any).insert({
        vehicle_id: aForm.vehicle_id,
        driver_name: aForm.driver_name,
        start_date: aForm.start_date,
        status: "em_uso",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle_assignments"] });
      setAOpen(false);
      setAForm({ vehicle_id: "", driver_name: "", start_date: new Date().toISOString().slice(0, 10) });
      toast.success("Atribuição criada");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const finalizeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicle_assignments" as any).update({
        status: "finalizado",
        end_date: new Date().toISOString().slice(0, 10),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle_assignments"] });
      toast.success("Atribuição finalizada");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicle_assignments" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle_assignments"] });
      toast.success(t("toast.deleted"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // ─── USAGE LOG MUTATIONS ───
  const saveUsageLog = useMutation({
    mutationFn: async () => {
      const kmStart = parseFloat(uForm.km_start) || 0;
      const kmEnd = parseFloat(uForm.km_end) || 0;
      const fuelCost = parseFloat(uForm.fuel_cost) || 0;
      const liters = parseFloat(uForm.liters) || 0;

      const { error } = await supabase.from("vehicle_usage_logs" as any).insert({
        vehicle_id: uVehicleId,
        driver_name: uForm.driver_name,
        km_start: kmStart,
        km_end: kmEnd,
        start_location: uForm.start_location || null,
        end_location: uForm.end_location || null,
        date: uForm.date,
        fuel_cost: fuelCost,
        liters: liters,
      });
      if (error) throw error;

      // Auto-create fuel expense in accounting
      if (fuelCost > 0) {
        const vehicle = vehicles.find((v: any) => v.id === uVehicleId);
        await supabase.from("financial_records").insert({
          type: "expense",
          source: "fleet",
          category: "fuel",
          amount: fuelCost,
          label: `Combustível — ${vehicle?.brand || ""} ${vehicle?.model || ""} ${vehicle?.license_plate || ""}`.trim(),
          notes: `${kmEnd - kmStart} km, ${liters}L`,
          status: "confirmed",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle_usage_logs"] });
      queryClient.invalidateQueries({ queryKey: ["financial_records"] });
      setUOpen(false);
      setUVehicleId("");
      setUForm({ driver_name: "", km_start: "", km_end: "", start_location: "", end_location: "", fuel_cost: "", liters: "", date: new Date().toISOString().slice(0, 10) });
      toast.success("Trajeto registrado");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // ─── DOCUMENT MUTATIONS ───
  const uploadVehicleDoc = async (file: File) => {
    if (!docVehicleId) return;
    const storagePath = `fleet/${docVehicleId}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("uploads").upload(storagePath, file);
    if (upErr) { toast.error(upErr.message); return; }

    const { data: urlData } = await supabase.storage.from("uploads").createSignedUrl(storagePath, 31536000);
    const fileUrl = urlData?.signedUrl || storagePath;

    const { error } = await supabase.from("vehicle_documents" as any).insert({
      vehicle_id: docVehicleId,
      file_url: fileUrl,
      storage_path: storagePath,
      file_name: file.name,
      doc_type: docType,
    });
    if (error) toast.error(error.message);
    else {
      queryClient.invalidateQueries({ queryKey: ["vehicle_documents"] });
      toast.success("Documento enviado");
    }
  };

  const deleteVehicleDoc = useMutation({
    mutationFn: async (doc: any) => {
      if (doc.storage_path) await supabase.storage.from("uploads").remove([doc.storage_path]);
      const { error } = await supabase.from("vehicle_documents" as any).delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle_documents"] });
      toast.success(t("toast.deleted"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const handleDocPreview = async (doc: any) => {
    if (doc.storage_path) {
      const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 300);
      if (data?.signedUrl) {
        setPreviewUrl(data.signedUrl);
        setPreviewName(doc.file_name);
        setPreviewMime(doc.file_name?.endsWith(".pdf") ? "application/pdf" : "image/*");
      }
    }
  };

  const handleDocDownload = async (doc: any) => {
    if (doc.storage_path) {
      const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 300);
      if (data?.signedUrl) {
        const a = document.createElement("a");
        a.href = data.signedUrl;
        a.download = doc.file_name;
        a.click();
      }
    }
  };

  const handleDocPrint = async (doc: any) => {
    if (doc.storage_path) {
      const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 300);
      if (data?.signedUrl) {
        const w = window.open(data.signedUrl, "_blank");
        w?.addEventListener("load", () => w.print());
      }
    }
  };

  // ─── FUEL RECEIPT ───
  const uploadFuelReceipt = async (file: File) => {
    if (!receiptLogId) return;
    const storagePath = `fleet/receipts/${receiptLogId}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("uploads").upload(storagePath, file);
    if (upErr) { toast.error(upErr.message); return; }

    const { data: urlData } = await supabase.storage.from("uploads").createSignedUrl(storagePath, 31536000);

    const { error } = await supabase.from("fuel_receipts" as any).insert({
      usage_log_id: receiptLogId,
      file_url: urlData?.signedUrl || storagePath,
      storage_path: storagePath,
      file_name: file.name,
      amount: 0,
    });
    if (error) toast.error(error.message);
    else {
      queryClient.invalidateQueries({ queryKey: ["fuel_receipts"] });
      toast.success("Comprovante enviado");
    }
  };

  // ─── GEOLOCATION ───
  const useCurrentLocation = (field: "start_location" | "end_location") => {
    if (!navigator.geolocation) { toast.error("Geolocalização não disponível"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        setUForm(p => ({ ...p, [field]: loc }));
        toast.success("Localização obtida");
      },
      () => toast.error("Não foi possível obter localização"),
    );
  };

  // ─── HELPER ───
  const getVehicleLabel = (id: string) => {
    const v = vehicles.find((v: any) => v.id === id);
    return v ? `${v.brand || ""} ${v.model || ""} — ${v.license_plate}`.trim() : id.slice(0, 8);
  };

  const docTypeLabels: Record<string, string> = {
    seguro: "Seguro",
    documento: "Documento",
    inspecao: "Inspeção",
    outros: "Outros",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Car className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Gestão de Frota</h1>
          <p className="text-xs text-muted-foreground">Sistema inteligente de rastreamento e custos de veículos</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total Veículos", value: String(vehicles.length), icon: Car },
          { label: "Condutores Ativos", value: String(activeAssignments), icon: Users },
          { label: "Distância Total", value: `${totalDistance.toLocaleString()} km`, icon: Route },
          { label: "Custo Combustível", value: formatCurrency(totalFuelCost), icon: Fuel, color: "text-destructive" },
          { label: "Custo/km", value: `${formatCurrency(costPerKm)}/km`, icon: BarChart3 },
        ].map((kpi) => (
          <Card key={kpi.label} className="border-border/50">
            <CardContent className="pt-3 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
              </div>
              <p className={`text-lg font-bold tabular-nums ${kpi.color || "text-foreground"}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 h-9">
          <TabsTrigger value="vehicles" className="text-xs">Veículos</TabsTrigger>
          <TabsTrigger value="assignments" className="text-xs">Condutores</TabsTrigger>
          <TabsTrigger value="usage" className="text-xs">Trajetos</TabsTrigger>
          <TabsTrigger value="weekly" className="text-xs">Semanal</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs">Documentos</TabsTrigger>
        </TabsList>

        {/* ═══ VEHICLES TAB ═══ */}
        <TabsContent value="vehicles" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={vOpen} onOpenChange={(v) => { setVOpen(v); if (!v) setVEditId(null); }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" />Novo Veículo</Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader><DialogTitle>{vEditId ? "Editar Veículo" : "Novo Veículo"}</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Placa *</Label>
                    <Input value={vForm.license_plate} onChange={e => setVForm(p => ({ ...p, license_plate: e.target.value }))} placeholder="AB-123-CD" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Marca</Label>
                      <Input value={vForm.brand} onChange={e => setVForm(p => ({ ...p, brand: e.target.value }))} placeholder="Renault" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Modelo</Label>
                      <Input value={vForm.model} onChange={e => setVForm(p => ({ ...p, model: e.target.value }))} placeholder="Clio" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Ano</Label>
                      <Input type="number" value={vForm.year} onChange={e => setVForm(p => ({ ...p, year: e.target.value }))} placeholder="2023" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Combustível</Label>
                      <Select value={vForm.fuel_type} onValueChange={v => setVForm(p => ({ ...p, fuel_type: v }))}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Tipo" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gasoline">Gasolina</SelectItem>
                          <SelectItem value="diesel">Diesel</SelectItem>
                          <SelectItem value="electric">Elétrico</SelectItem>
                          <SelectItem value="hybrid">Híbrido</SelectItem>
                          <SelectItem value="lpg">GPL</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Potência</Label>
                      <Input value={vForm.power} onChange={e => setVForm(p => ({ ...p, power: e.target.value }))} placeholder="110 cv" />
                    </div>
                  </div>
                  <Button className="w-full" onClick={() => saveVehicle.mutate()} disabled={saveVehicle.isPending || !vForm.license_plate}>
                    {saveVehicle.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Guardar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {vLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : vehicles.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Nenhum veículo registrado</div>
          ) : (
            <div className="rounded-lg border border-border/50 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead>Placa</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Ano</TableHead>
                    <TableHead>Combustível</TableHead>
                    <TableHead>Potência</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicles.map((v: any) => (
                    <TableRow key={v.id} className="text-xs">
                      <TableCell className="font-mono font-medium">{v.license_plate}</TableCell>
                      <TableCell>{v.brand || "—"}</TableCell>
                      <TableCell>{v.model || "—"}</TableCell>
                      <TableCell>{v.year || "—"}</TableCell>
                      <TableCell>
                        {v.fuel_type ? (
                          <Badge variant="outline" className="text-[10px]">
                            {{ gasoline: "Gasolina", diesel: "Diesel", electric: "Elétrico", hybrid: "Híbrido", lpg: "GPL" }[v.fuel_type as string] || v.fuel_type}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{v.power || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setDocVehicleId(v.id); setDocOpen(true); }} title="Documentos">
                            <FolderOpen className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setUVehicleId(v.id); setUOpen(true); }} title="Novo Trajeto">
                            <Route className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditVehicle(v)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteVehicle.mutate(v.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ═══ ASSIGNMENTS TAB ═══ */}
        <TabsContent value="assignments" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={aOpen} onOpenChange={setAOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nova Atribuição</Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader><DialogTitle>Atribuir Condutor</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Veículo *</Label>
                    <Select value={aForm.vehicle_id} onValueChange={v => setAForm(p => ({ ...p, vehicle_id: v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecionar veículo" /></SelectTrigger>
                      <SelectContent>
                        {vehicles.map((v: any) => (
                          <SelectItem key={v.id} value={v.id}>{v.brand} {v.model} — {v.license_plate}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Nome do Condutor *</Label>
                    <Input value={aForm.driver_name} onChange={e => setAForm(p => ({ ...p, driver_name: e.target.value }))} placeholder="Nome completo" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data de Início</Label>
                    <Input type="date" value={aForm.start_date} onChange={e => setAForm(p => ({ ...p, start_date: e.target.value }))} />
                  </div>
                  <Button className="w-full" onClick={() => saveAssignment.mutate()} disabled={saveAssignment.isPending || !aForm.vehicle_id || !aForm.driver_name}>
                    {saveAssignment.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Guardar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {assignments.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Nenhuma atribuição registrada</div>
          ) : (
            <div className="rounded-lg border border-border/50 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead>Condutor</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Data Início</TableHead>
                    <TableHead>Data Fim</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a: any) => (
                    <TableRow key={a.id} className="text-xs">
                      <TableCell className="font-medium">{a.driver_name}</TableCell>
                      <TableCell>{getVehicleLabel(a.vehicle_id)}</TableCell>
                      <TableCell>{formatDate(a.start_date)}</TableCell>
                      <TableCell>{a.end_date ? formatDate(a.end_date) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={a.status === "em_uso" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground"}>
                          {a.status === "em_uso" ? "Em uso" : "Finalizado"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {a.status === "em_uso" && (
                            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => finalizeAssignment.mutate(a.id)}>
                              Finalizar
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteAssignment.mutate(a.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ═══ USAGE LOGS TAB ═══ */}
        <TabsContent value="usage" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={uOpen} onOpenChange={setUOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" />Novo Trajeto</Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border max-w-lg">
                <DialogHeader><DialogTitle>Registrar Trajeto</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Veículo *</Label>
                      <Select value={uVehicleId} onValueChange={setUVehicleId}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                        <SelectContent>
                          {vehicles.map((v: any) => (
                            <SelectItem key={v.id} value={v.id}>{v.license_plate}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Condutor</Label>
                      <Input value={uForm.driver_name} onChange={e => setUForm(p => ({ ...p, driver_name: e.target.value }))} placeholder="Nome" className="h-9" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data</Label>
                    <Input type="date" value={uForm.date} onChange={e => setUForm(p => ({ ...p, date: e.target.value }))} className="h-9" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">KM Inicial *</Label>
                      <Input type="number" value={uForm.km_start} onChange={e => setUForm(p => ({ ...p, km_start: e.target.value }))} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">KM Final *</Label>
                      <Input type="number" value={uForm.km_end} onChange={e => setUForm(p => ({ ...p, km_end: e.target.value }))} className="h-9" />
                    </div>
                  </div>
                  {uForm.km_start && uForm.km_end && (
                    <p className="text-xs text-muted-foreground">
                      Distância: <span className="font-medium text-foreground">{Math.max(0, parseFloat(uForm.km_end) - parseFloat(uForm.km_start))} km</span>
                    </p>
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Ponto de Partida</Label>
                      <Button variant="link" size="sm" className="h-5 text-[10px] p-0" onClick={() => useCurrentLocation("start_location")}>
                        <MapPin className="h-3 w-3 mr-0.5" />Usar localização atual
                      </Button>
                    </div>
                    <Input value={uForm.start_location} onChange={e => setUForm(p => ({ ...p, start_location: e.target.value }))} placeholder="Endereço ou coordenadas" className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Ponto de Chegada</Label>
                      <Button variant="link" size="sm" className="h-5 text-[10px] p-0" onClick={() => useCurrentLocation("end_location")}>
                        <MapPin className="h-3 w-3 mr-0.5" />Usar localização atual
                      </Button>
                    </div>
                    <Input value={uForm.end_location} onChange={e => setUForm(p => ({ ...p, end_location: e.target.value }))} placeholder="Endereço ou coordenadas" className="h-9" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Litros</Label>
                      <Input type="number" step="0.1" value={uForm.liters} onChange={e => setUForm(p => ({ ...p, liters: e.target.value }))} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Custo Combustível (€)</Label>
                      <Input type="number" step="0.01" value={uForm.fuel_cost} onChange={e => setUForm(p => ({ ...p, fuel_cost: e.target.value }))} className="h-9" />
                    </div>
                  </div>
                  <Button className="w-full" onClick={() => saveUsageLog.mutate()} disabled={saveUsageLog.isPending || !uVehicleId || !uForm.km_start || !uForm.km_end}>
                    {saveUsageLog.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Guardar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {usageLogs.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Nenhum trajeto registrado</div>
          ) : (
            <div className="rounded-lg border border-border/50 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead>Data</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Condutor</TableHead>
                    <TableHead className="text-right">KM Ini</TableHead>
                    <TableHead className="text-right">KM Fim</TableHead>
                    <TableHead className="text-right">Distância</TableHead>
                    <TableHead>Partida</TableHead>
                    <TableHead>Chegada</TableHead>
                    <TableHead className="text-right">Litros</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageLogs.slice(0, 50).map((l: any) => {
                    const dist = Number(l.distance || (Number(l.km_end) - Number(l.km_start))) || 0;
                    return (
                      <TableRow key={l.id} className="text-xs">
                        <TableCell>{formatDate(l.date)}</TableCell>
                        <TableCell className="font-mono">{getVehicleLabel(l.vehicle_id)}</TableCell>
                        <TableCell>{l.driver_name || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(l.km_start).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(l.km_end).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{dist.toLocaleString()} km</TableCell>
                        <TableCell className="max-w-[100px] truncate">{l.start_location || "—"}</TableCell>
                        <TableCell className="max-w-[100px] truncate">{l.end_location || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.liters ? `${l.liters}L` : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.fuel_cost ? formatCurrency(Number(l.fuel_cost)) : "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setReceiptLogId(l.id); setReceiptOpen(true); }} title="Comprovantes">
                              <Upload className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ═══ WEEKLY TAB ═══ */}
        <TabsContent value="weekly" className="space-y-4 mt-4">
          {weeklyData.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Nenhum dado semanal disponível</div>
          ) : (
            <div className="rounded-lg border border-border/50 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead>Período (Dom → Sáb)</TableHead>
                    <TableHead className="text-right">Trajetos</TableHead>
                    <TableHead className="text-right">KM Total</TableHead>
                    <TableHead className="text-right">Custo Combustível</TableHead>
                    <TableHead className="text-right">Custo/km</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyData.map(([week, data]) => (
                    <TableRow key={week} className="text-xs">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="h-3 w-3 text-muted-foreground" />
                          {week}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{data.trips}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{data.km.toLocaleString()} km</TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">{formatCurrency(data.fuel)}</TableCell>
                      <TableCell className="text-right tabular-nums">{data.km > 0 ? formatCurrency(data.fuel / data.km) : "—"}/km</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ═══ DOCUMENTS TAB ═══ */}
        <TabsContent value="documents" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {vehicles.map((v: any) => (
              <Card key={v.id} className="border-border/50 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setDocVehicleId(v.id); setDocOpen(true); }}>
                <CardContent className="pt-3 pb-2">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs font-medium">{v.license_plate}</p>
                      <p className="text-[10px] text-muted-foreground">{v.brand} {v.model}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {vehicles.length === 0 && (
            <div className="text-center py-12 text-sm text-muted-foreground">Registe um veículo primeiro</div>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══ VEHICLE DOCUMENTS DIALOG ═══ */}
      <Dialog open={docOpen} onOpenChange={setDocOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Documentos — {docVehicleId ? getVehicleLabel(docVehicleId) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Upload */}
            <div className="flex items-center gap-2">
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="seguro">Seguro</SelectItem>
                  <SelectItem value="documento">Documento</SelectItem>
                  <SelectItem value="inspecao">Inspeção</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" asChild className="h-8">
                <label className="cursor-pointer">
                  <Upload className="h-3 w-3 mr-1" />Enviar
                  <input type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) uploadVehicleDoc(e.target.files[0]); e.target.value = ""; }} />
                </label>
              </Button>
            </div>

            {/* Doc list */}
            {vehicleDocs.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">Nenhum documento</div>
            ) : (
              <div className="rounded-lg border border-border/50 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[11px]">
                      <TableHead>Ficheiro</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicleDocs.map((d: any) => (
                      <TableRow key={d.id} className="text-xs">
                        <TableCell className="font-medium flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate max-w-[200px]">{d.file_name}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{docTypeLabels[d.doc_type] || d.doc_type}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(d.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDocPreview(d)} title="Ver"><Eye className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDocDownload(d)} title="Download"><Download className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDocPrint(d)} title="Imprimir"><Printer className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteVehicleDoc.mutate(d)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ FUEL RECEIPT DIALOG ═══ */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle>Comprovantes de Combustível</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <Button size="sm" asChild className="h-8">
              <label className="cursor-pointer">
                <Upload className="h-3 w-3 mr-1" />Enviar Comprovante
                <input type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) uploadFuelReceipt(e.target.files[0]); e.target.value = ""; }} />
              </label>
            </Button>
            {fuelReceipts.length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground">Nenhum comprovante</div>
            ) : (
              <div className="space-y-2">
                {fuelReceipts.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 text-xs">
                    <span className="truncate max-w-[200px] font-medium">{r.file_name}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={async () => {
                        if (r.storage_path) {
                          const { data } = await supabase.storage.from("uploads").createSignedUrl(r.storage_path, 300);
                          if (data?.signedUrl) { setPreviewUrl(data.signedUrl); setPreviewName(r.file_name); setPreviewMime(r.file_name?.endsWith(".pdf") ? "application/pdf" : "image/*"); }
                        }
                      }}><Eye className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ PREVIEW DIALOG ═══ */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="bg-card border-border max-w-3xl max-h-[80vh]">
          <DialogHeader><DialogTitle>{previewName}</DialogTitle></DialogHeader>
          <div className="overflow-auto max-h-[65vh]">
            {previewMime === "application/pdf" ? (
              <iframe src={previewUrl || ""} className="w-full h-[60vh] rounded" />
            ) : (
              <img src={previewUrl || ""} alt={previewName} className="max-w-full rounded" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
