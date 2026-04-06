import { useState, useEffect, useCallback } from "react";
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
import { Save, Trash2, MapPin, Navigation, Loader2, CheckCircle, Locate } from "lucide-react";

interface TripPoint {
  name: string;
  number: string;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
}

const makePoint = (name: string): TripPoint => ({
  name, number: "", street: "", postal_code: "", city: "", country: "Portugal", latitude: "", longitude: "",
});

const ACTIVE_TRIP_KEY = "fleet_active_trip_id";

export default function TripsModule() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vehicle_id: "", driver_id: "", date: new Date().toISOString().slice(0, 10), km_start: "", km_end: "", notes: "" });
  const [points, setPoints] = useState<TripPoint[]>([makePoint("Ponto de partida")]);
  const [gpsLoading, setGpsLoading] = useState<number | null>(null);

  const { data: vehicles = [] } = useQuery({
    queryKey: ["fleet_vehicles"],
    queryFn: async () => { const { data } = await supabase.from("vehicles").select("*").order("license_plate"); return data || []; },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["fleet_drivers"],
    queryFn: async () => { const { data } = await supabase.from("drivers").select("*").eq("status", "active").order("full_name"); return (data || []) as any[]; },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["fleet_assignments"],
    queryFn: async () => { const { data } = await supabase.from("vehicle_assignments").select("*").eq("status", "em_uso"); return (data || []) as any[]; },
  });

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ["fleet_trips"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fleet_trips").select("*").order("date", { ascending: false });
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

  const onVehicleChange = (vid: string) => {
    const assignment = assignments.find((a: any) => a.vehicle_id === vid);
    setForm(p => ({ ...p, vehicle_id: vid, driver_id: assignment?.driver_id || "" }));
  };

  // GPS + Reverse Geocoding
  const getGPS = useCallback(async (i: number) => {
    if (!navigator.geolocation) { toast.error("GPS indisponível"); return; }
    setGpsLoading(i);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lon = pos.coords.longitude.toFixed(6);
        setPoints(p => p.map((pt, idx) => idx === i ? { ...pt, latitude: lat, longitude: lon } : pt));

        // Reverse geocode via Nominatim (free, no API key)
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1&accept-language=pt`);
          if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            setPoints(p => p.map((pt, idx) => idx === i ? {
              ...pt,
              latitude: lat,
              longitude: lon,
              street: addr.road || addr.pedestrian || "",
              number: addr.house_number || "",
              postal_code: addr.postcode || "",
              city: addr.city || addr.town || addr.village || addr.municipality || "",
              country: addr.country || "Portugal",
            } : pt));
            toast.success("Endereço preenchido via GPS");
          }
        } catch { /* ignore geocode errors */ }
        setGpsLoading(null);
      },
      () => { toast.error("GPS indisponível"); setGpsLoading(null); },
    );
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      const kmStart = parseFloat(form.km_start);
      const kmEnd = form.km_end ? parseFloat(form.km_end) : null;

      if (isNaN(kmStart)) throw new Error("KM início é obrigatório");
      if (kmEnd !== null && kmEnd <= kmStart) throw new Error("KM fim deve ser maior que KM início");

      const hasAssignment = assignments.some((a: any) => a.vehicle_id === form.vehicle_id && a.driver_id === form.driver_id);
      if (!hasAssignment) throw new Error("O condutor não está atribuído a este veículo");

      const totalDist = kmEnd ? kmEnd - kmStart : null;

      const { data: trip, error } = await supabase.from("fleet_trips").insert({
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id,
        date: form.date,
        km_start: kmStart,
        km_end: kmEnd,
        total_distance: totalDist,
        status: kmEnd ? "completed" : "in_progress",
        notes: form.notes || null,
      } as any).select().single();
      if (error) throw error;

      // Persist active trip
      if (!kmEnd) {
        localStorage.setItem(ACTIVE_TRIP_KEY, (trip as any).id);
      }

      // Save trip points
      const validPoints = points.filter(p => p.street || p.city);
      if (validPoints.length > 0) {
        const pointRows = validPoints.map((p, i) => ({
          trip_id: (trip as any).id,
          order_index: i,
          address: [p.street, p.number].filter(Boolean).join(" ") || null,
          postal_code: p.postal_code || null,
          city: p.city || null,
          latitude: p.latitude ? parseFloat(p.latitude) : null,
          longitude: p.longitude ? parseFloat(p.longitude) : null,
        }));
        await supabase.from("fleet_trip_points").insert(pointRows as any);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_trips"] });
      closeDialog();
      toast.success("Trajeto iniciado");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const completeTrip = useMutation({
    mutationFn: async ({ id, km_end }: { id: string; km_end: number }) => {
      // Get km_start to calculate distance
      const trip = trips.find((t: any) => t.id === id);
      const totalDist = trip ? km_end - Number(trip.km_start) : null;
      const { error } = await supabase.from("fleet_trips").update({
        km_end, status: "completed", total_distance: totalDist,
      } as any).eq("id", id);
      if (error) throw error;
      localStorage.removeItem(ACTIVE_TRIP_KEY);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet_trips"] }); toast.success("Trajeto finalizado"); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("fleet_trip_points").delete().eq("trip_id", id);
      const { error } = await supabase.from("fleet_trips").delete().eq("id", id);
      if (error) throw error;
      localStorage.removeItem(ACTIVE_TRIP_KEY);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet_trips"] }); toast.success("Removido"); },
  });

  const closeDialog = () => {
    setOpen(false);
    setForm({ vehicle_id: "", driver_id: "", date: new Date().toISOString().slice(0, 10), km_start: "", km_end: "", notes: "" });
    setPoints([makePoint("Ponto de partida")]);
  };

  const addPoint = () => {
    const idx = points.length;
    setPoints(p => [...p, makePoint(`Ponto ${idx}`)]);
  };

  const addFinalPoint = () => {
    setPoints(p => [...p, makePoint("Destino final")]);
  };

  const removePoint = (i: number) => setPoints(p => p.filter((_, idx) => idx !== i));
  const setPoint = (i: number, k: keyof TripPoint, v: string) => {
    setPoints(p => p.map((pt, idx) => idx === i ? { ...pt, [k]: v } : pt));
  };

  // Quick start
  const quickStart = () => {
    if (assignments.length === 1) {
      const a = assignments[0] as any;
      setForm(p => ({ ...p, vehicle_id: a.vehicle_id, driver_id: a.driver_id }));
    }
    setOpen(true);
  };

  // Complete trip dialog
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeTripId, setCompleteTripId] = useState("");
  const [completeKm, setCompleteKm] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold">Trajetos</h2>
          <p className="text-xs text-muted-foreground">Registo de deslocações com pontos e quilometragem</p>
        </div>
        <Button size="sm" onClick={quickStart}>
          <Navigation className="h-4 w-4 mr-1" /> Iniciar Trajeto
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Condutor</TableHead>
                <TableHead>KM Início</TableHead>
                <TableHead>KM Fim</TableHead>
                <TableHead>Distância</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : trips.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum trajeto registrado</TableCell></TableRow>
              ) : trips.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell>{t.date}</TableCell>
                  <TableCell>{getVehicleLabel(t.vehicle_id)}</TableCell>
                  <TableCell>{getDriverName(t.driver_id)}</TableCell>
                  <TableCell className="tabular-nums">{Number(t.km_start).toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums">{t.km_end ? Number(t.km_end).toLocaleString() : "—"}</TableCell>
                  <TableCell className="font-semibold tabular-nums">{t.total_distance ? `${Number(t.total_distance).toLocaleString()} km` : "—"}</TableCell>
                  <TableCell>
                    <Badge className={t.status === "completed" ? "bg-green-500/10 text-green-500" : "bg-blue-500/10 text-blue-500"}>
                      {t.status === "completed" ? "Concluído" : "Em curso"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {t.status === "in_progress" && (
                      <Button variant="outline" size="sm" onClick={() => { setCompleteTripId(t.id); setCompleteKm(""); setCompleteOpen(true); }}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Finalizar
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(t.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Start Trip Dialog */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Iniciar Trajeto</DialogTitle>
            <DialogDescription>Registe um novo trajeto com pontos de passagem.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Vehicle & Driver */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Veículo *</Label>
                <Select value={form.vehicle_id} onValueChange={onVehicleChange}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.brand} {v.model} — {v.license_plate}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Condutor *</Label>
                <Select value={form.driver_id} onValueChange={v => setForm(p => ({ ...p, driver_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {drivers.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Data Início</Label><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
              <div><Label>KM Início *</Label><Input type="number" value={form.km_start} onChange={e => setForm(p => ({ ...p, km_start: e.target.value }))} /></div>
            </div>

            {/* Trip Points */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">Pontos de Passagem</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={addPoint} className="h-7 text-xs">+ Ponto</Button>
                  <Button size="sm" variant="outline" onClick={addFinalPoint} className="h-7 text-xs">+ Destino Final</Button>
                </div>
              </div>
              <div className="space-y-3">
                {points.map((pt, i) => (
                  <Card key={i} className="p-3 border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold">{pt.name}</span>
                      <Button
                        size="sm" variant="ghost" className="ml-auto h-6 text-xs gap-1"
                        onClick={() => getGPS(i)}
                        disabled={gpsLoading === i}
                      >
                        {gpsLoading === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Locate className="h-3 w-3" />}
                        GPS
                      </Button>
                      {points.length > 1 && (
                        <Button size="sm" variant="ghost" className="h-6" onClick={() => removePoint(i)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="col-span-3"><Input placeholder="Rua" value={pt.street} onChange={e => setPoint(i, "street", e.target.value)} className="text-xs" /></div>
                      <div><Input placeholder="Nº" value={pt.number} onChange={e => setPoint(i, "number", e.target.value)} className="text-xs" /></div>
                      <div><Input placeholder="Código Postal" value={pt.postal_code} onChange={e => setPoint(i, "postal_code", e.target.value)} className="text-xs" /></div>
                      <div><Input placeholder="Cidade" value={pt.city} onChange={e => setPoint(i, "city", e.target.value)} className="text-xs" /></div>
                      <div className="col-span-2"><Input placeholder="País" value={pt.country} onChange={e => setPoint(i, "country", e.target.value)} className="text-xs" /></div>
                    </div>
                    {(pt.latitude || pt.longitude) && (
                      <p className="text-[10px] text-muted-foreground mt-1">📍 {pt.latitude}, {pt.longitude}</p>
                    )}
                  </Card>
                ))}
              </div>
            </div>

            {/* KM End + Notes */}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>KM Fim (opcional)</Label><Input type="number" value={form.km_end} onChange={e => setForm(p => ({ ...p, km_end: e.target.value }))} placeholder="Deixar vazio se em curso" /></div>
              <div><Label>Notas</Label><Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!form.vehicle_id || !form.driver_id || !form.km_start || save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Navigation className="h-4 w-4 mr-1" />}
              Iniciar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Complete Trip Dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar Trajeto</DialogTitle>
            <DialogDescription>Insira a quilometragem final.</DialogDescription>
          </DialogHeader>
          <div><Label>KM Fim *</Label><Input type="number" value={completeKm} onChange={e => setCompleteKm(e.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancelar</Button>
            <Button onClick={() => { completeTrip.mutate({ id: completeTripId, km_end: parseFloat(completeKm) }); setCompleteOpen(false); }} disabled={!completeKm}>
              Finalizar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
