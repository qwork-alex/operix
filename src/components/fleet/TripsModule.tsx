import { useState, useEffect, useCallback, useRef } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Save, Trash2, MapPin, Navigation, Loader2, CheckCircle, Locate, Plus, ArrowRight } from "lucide-react";

/* ─── Types ─── */
interface TripPoint {
  label: string;
  number: string;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
}

interface TripForm {
  vehicle_id: string;
  driver_id: string;
  date: string;
  km_start: string;
  km_end: string;
  notes: string;
}

const STORAGE_KEY = "fleet_active_trip_session";

const makePoint = (label: string): TripPoint => ({
  label, number: "", street: "", postal_code: "", city: "", country: "Portugal", latitude: "", longitude: "",
});

const defaultForm = (): TripForm => ({
  vehicle_id: "", driver_id: "", date: new Date().toISOString().slice(0, 10), km_start: "", km_end: "", notes: "",
});

/* ─── Haversine distance (km) ─── */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ─── Component ─── */
export default function TripsModule() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TripForm>(defaultForm());
  const [points, setPoints] = useState<TripPoint[]>([makePoint("Ponto de Partida")]);
  const [gpsLoading, setGpsLoading] = useState<number | null>(null);
  const [resumingTripId, setResumingTripId] = useState<string | null>(null);

  // Complete trip mini-dialog
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeTripId, setCompleteTripId] = useState("");
  const [completeKm, setCompleteKm] = useState("");

  /* ─── Queries ─── */
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

  /* ─── Helpers ─── */
  const getVehicleLabel = (id: string) => {
    const v = vehicles.find((x: any) => x.id === id);
    return v ? `${v.brand || ""} ${v.model || ""} — ${v.license_plate}`.trim() : "—";
  };
  const getDriverName = (id: string) => {
    const d = drivers.find((x: any) => x.id === id);
    return d ? d.full_name : "—";
  };

  /* ─── Persist form to localStorage on every change ─── */
  const saveSession = useCallback((f: TripForm, p: TripPoint[], tripId: string | null) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ form: f, points: p, tripId, ts: Date.now() }));
  }, []);

  // Auto-save on form/points change
  useEffect(() => {
    if (open || resumingTripId) {
      saveSession(form, points, resumingTripId);
    }
  }, [form, points, open, resumingTripId, saveSession]);

  /* ─── Restore session on mount ─── */
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const session = JSON.parse(stored);
      if (session.tripId) {
        // There's an active trip in the DB — just set the resuming ID
        setResumingTripId(session.tripId);
        setForm(session.form || defaultForm());
        setPoints(session.points || [makePoint("Ponto de Partida")]);
      }
    } catch { /* ignore */ }
  }, []);

  /* ─── Vehicle change auto-selects assigned driver ─── */
  const onVehicleChange = (vid: string) => {
    const assignment = assignments.find((a: any) => a.vehicle_id === vid);
    setForm(p => ({ ...p, vehicle_id: vid, driver_id: assignment?.driver_id || "" }));
  };

  /* ─── GPS + Reverse Geocoding ─── */
  const getGPS = useCallback(async (i: number) => {
    if (!navigator.geolocation) { toast.error("GPS indisponível"); return; }
    setGpsLoading(i);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lon = pos.coords.longitude.toFixed(6);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1&accept-language=pt`);
          if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            setPoints(p => p.map((pt, idx) => idx === i ? {
              ...pt, latitude: lat, longitude: lon,
              street: addr.road || addr.pedestrian || pt.street,
              number: addr.house_number || pt.number,
              postal_code: addr.postcode || pt.postal_code,
              city: addr.city || addr.town || addr.village || addr.municipality || pt.city,
              country: addr.country || pt.country,
            } : pt));
            toast.success("Endereço preenchido via GPS");
          } else {
            setPoints(p => p.map((pt, idx) => idx === i ? { ...pt, latitude: lat, longitude: lon } : pt));
          }
        } catch {
          setPoints(p => p.map((pt, idx) => idx === i ? { ...pt, latitude: lat, longitude: lon } : pt));
        }
        setGpsLoading(null);
      },
      () => { toast.error("Erro ao obter localização GPS"); setGpsLoading(null); },
    );
  }, []);

  /* ─── Point management ─── */
  const addIntermediatePoint = () => {
    // Insert before last point if it's "Destino Final", otherwise just append
    const lastIdx = points.length - 1;
    const isLastFinal = points[lastIdx]?.label === "Destino Final";
    const newLabel = `Ponto ${points.filter(p => p.label.startsWith("Ponto ")).length + 1}`;
    if (isLastFinal) {
      setPoints(p => [...p.slice(0, lastIdx), makePoint(newLabel), p[lastIdx]]);
    } else {
      setPoints(p => [...p, makePoint(newLabel)]);
    }
  };

  const addFinalPoint = () => {
    if (points.some(p => p.label === "Destino Final")) { toast.info("Destino final já adicionado"); return; }
    setPoints(p => [...p, makePoint("Destino Final")]);
  };

  const removePoint = (i: number) => {
    if (points.length <= 1) return;
    setPoints(p => p.filter((_, idx) => idx !== i));
  };

  const setPointField = (i: number, k: keyof TripPoint, v: string) => {
    setPoints(p => p.map((pt, idx) => idx === i ? { ...pt, [k]: v } : pt));
  };

  /* ─── Distance calculations ─── */
  const segmentDistances = points.reduce<number[]>((acc, pt, i) => {
    if (i === 0) return acc;
    const prev = points[i - 1];
    if (prev.latitude && prev.longitude && pt.latitude && pt.longitude) {
      acc.push(haversine(parseFloat(prev.latitude), parseFloat(prev.longitude), parseFloat(pt.latitude), parseFloat(pt.longitude)));
    } else {
      acc.push(0);
    }
    return acc;
  }, []);
  const totalGpsDistance = segmentDistances.reduce((s, d) => s + d, 0);

  /* ─── Save / Start trip ─── */
  const saveMutation = useMutation({
    mutationFn: async () => {
      const kmStart = parseFloat(form.km_start);
      if (isNaN(kmStart)) throw new Error("KM início é obrigatório");

      const hasAssignment = assignments.some((a: any) => a.vehicle_id === form.vehicle_id && a.driver_id === form.driver_id);
      if (!hasAssignment) throw new Error("O condutor não está atribuído a este veículo");

      const { data: trip, error } = await supabase.from("fleet_trips").insert({
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id,
        date: form.date,
        km_start: kmStart,
        km_end: null,
        total_distance: null,
        status: "in_progress",
        notes: form.notes || null,
      } as any).select().single();
      if (error) throw error;

      const tripId = (trip as any).id;
      setResumingTripId(tripId);

      // Save initial points
      const validPoints = points.filter(p => p.street || p.city);
      if (validPoints.length > 0) {
        const pointRows = validPoints.map((p, i) => ({
          trip_id: tripId,
          order_index: i,
          address: [p.number, p.street].filter(Boolean).join(" ") || null,
          postal_code: p.postal_code || null,
          city: p.city || null,
          latitude: p.latitude ? parseFloat(p.latitude) : null,
          longitude: p.longitude ? parseFloat(p.longitude) : null,
        }));
        await supabase.from("fleet_trip_points").insert(pointRows as any);
      }

      // Persist session
      saveSession(form, points, tripId);
      return tripId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_trips"] });
      toast.success("Trajeto iniciado com sucesso");
      // Don't close dialog — trip stays active
    },
    onError: (e) => toast.error((e as Error).message),
  });

  /* ─── Finalize trip ─── */
  const finalizeMutation = useMutation({
    mutationFn: async ({ id, km_end }: { id: string; km_end: number }) => {
      const trip = trips.find((t: any) => t.id === id);
      if (!trip) throw new Error("Trajeto não encontrado");
      const kmStart = Number(trip.km_start);
      if (km_end <= kmStart) throw new Error("KM fim deve ser maior que KM início");
      const totalDist = km_end - kmStart;

      // Save any remaining points
      const validPoints = points.filter(p => p.street || p.city);
      if (validPoints.length > 0 && resumingTripId === id) {
        // Delete old points and re-insert
        await supabase.from("fleet_trip_points").delete().eq("trip_id", id);
        const pointRows = validPoints.map((p, i) => ({
          trip_id: id,
          order_index: i,
          address: [p.number, p.street].filter(Boolean).join(" ") || null,
          postal_code: p.postal_code || null,
          city: p.city || null,
          latitude: p.latitude ? parseFloat(p.latitude) : null,
          longitude: p.longitude ? parseFloat(p.longitude) : null,
        }));
        await supabase.from("fleet_trip_points").insert(pointRows as any);
      }

      const { error } = await supabase.from("fleet_trips").update({
        km_end, status: "completed", total_distance: totalDist,
        notes: form.notes || null,
      } as any).eq("id", id);
      if (error) throw error;

      // Clear session
      localStorage.removeItem(STORAGE_KEY);
      setResumingTripId(null);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_trips"] });
      toast.success("Trajeto finalizado com sucesso");
      resetAndClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  /* ─── Quick finalize from table ─── */
  const quickFinalize = useMutation({
    mutationFn: async ({ id, km_end }: { id: string; km_end: number }) => {
      const trip = trips.find((t: any) => t.id === id);
      if (!trip) throw new Error("Trajeto não encontrado");
      const kmStart = Number(trip.km_start);
      if (km_end <= kmStart) throw new Error("KM fim deve ser maior que KM início");
      const { error } = await supabase.from("fleet_trips").update({
        km_end, status: "completed", total_distance: km_end - kmStart,
      } as any).eq("id", id);
      if (error) throw error;
      if (resumingTripId === id) {
        localStorage.removeItem(STORAGE_KEY);
        setResumingTripId(null);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_trips"] });
      setCompleteOpen(false);
      toast.success("Trajeto finalizado");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("fleet_trip_points").delete().eq("trip_id", id);
      const { error } = await supabase.from("fleet_trips").delete().eq("id", id);
      if (error) throw error;
      if (resumingTripId === id) {
        localStorage.removeItem(STORAGE_KEY);
        setResumingTripId(null);
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet_trips"] }); toast.success("Trajeto removido"); },
  });

  const resetAndClose = () => {
    setOpen(false);
    setForm(defaultForm());
    setPoints([makePoint("Ponto de Partida")]);
    setResumingTripId(null);
  };

  /* ─── Quick Start ─── */
  const quickStart = () => {
    // Check if there's already an active trip
    const activeTrip = trips.find((t: any) => t.status === "in_progress");
    if (activeTrip || resumingTripId) {
      // Resume it
      const tripToResume = activeTrip || trips.find((t: any) => t.id === resumingTripId);
      if (tripToResume) {
        setForm({
          vehicle_id: tripToResume.vehicle_id,
          driver_id: tripToResume.driver_id,
          date: tripToResume.date,
          km_start: String(tripToResume.km_start),
          km_end: tripToResume.km_end ? String(tripToResume.km_end) : "",
          notes: tripToResume.notes || "",
        });
        setResumingTripId(tripToResume.id);
        // Try to restore points from localStorage
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const session = JSON.parse(stored);
            if (session.tripId === tripToResume.id && session.points?.length) {
              setPoints(session.points);
            }
          }
        } catch { /* use defaults */ }
      }
      setOpen(true);
      return;
    }

    // Auto-fill if single assignment
    const f = defaultForm();
    if (assignments.length === 1) {
      const a = assignments[0] as any;
      f.vehicle_id = a.vehicle_id;
      f.driver_id = a.driver_id;
    }
    setForm(f);
    setPoints([makePoint("Ponto de Partida")]);
    setOpen(true);
  };

  /* ─── Resume from global bar ─── */
  const resumeTrip = useCallback(() => {
    const activeTrip = trips.find((t: any) => t.status === "in_progress");
    if (activeTrip) {
      setForm({
        vehicle_id: activeTrip.vehicle_id,
        driver_id: activeTrip.driver_id,
        date: activeTrip.date,
        km_start: String(activeTrip.km_start),
        km_end: "",
        notes: activeTrip.notes || "",
      });
      setResumingTripId(activeTrip.id);
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const session = JSON.parse(stored);
          if (session.tripId === activeTrip.id && session.points?.length) {
            setPoints(session.points);
          }
        }
      } catch { /* defaults */ }
      setOpen(true);
    }
  }, [trips]);

  // Expose resumeTrip for parent via window event
  useEffect(() => {
    const handler = () => resumeTrip();
    window.addEventListener("fleet:resume-trip", handler);
    return () => window.removeEventListener("fleet:resume-trip", handler);
  }, [resumeTrip]);

  const isActiveSession = !!resumingTripId;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold">Trajetos</h2>
          <p className="text-xs text-muted-foreground">Registo de deslocações com pontos e quilometragem</p>
        </div>
        <Button size="sm" onClick={quickStart}>
          <Navigation className="h-4 w-4 mr-1" />
          {resumingTripId || trips.some((t: any) => t.status === "in_progress") ? "Continuar Trajeto" : "Iniciar Trajeto"}
        </Button>
      </div>

      {/* Trips Table */}
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
                  <TableCell className="max-w-[140px] truncate">{getVehicleLabel(t.vehicle_id)}</TableCell>
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

      {/* ─── Trip Dialog (persistent, no close on outside click) ─── */}
      <Dialog open={open} onOpenChange={() => { /* Prevent closing by clicking outside */ }}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{isActiveSession ? "Trajeto em Curso" : "Iniciar Trajeto"}</DialogTitle>
            <DialogDescription>
              {isActiveSession ? "Continue a registar pontos de passagem ou finalize o trajeto." : "Registe um novo trajeto com pontos de passagem."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 1. Date + KM Start */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Início *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} disabled={isActiveSession} />
              </div>
              <div>
                <Label>KM Início *</Label>
                <Input type="number" value={form.km_start} onChange={e => setForm(p => ({ ...p, km_start: e.target.value }))} disabled={isActiveSession} />
              </div>
            </div>

            {/* 2. Vehicle + Driver (auto) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Veículo *</Label>
                <Select value={form.vehicle_id} onValueChange={onVehicleChange} disabled={isActiveSession}>
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
                <Select value={form.driver_id} onValueChange={v => setForm(p => ({ ...p, driver_id: v }))} disabled={isActiveSession}>
                  <SelectTrigger><SelectValue placeholder="Selecionar condutor" /></SelectTrigger>
                  <SelectContent>
                    {drivers.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 3. Points */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">Pontos de Passagem</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={addIntermediatePoint} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> Ponto
                  </Button>
                  <Button size="sm" variant="outline" onClick={addFinalPoint} className="h-7 text-xs">
                    <MapPin className="h-3 w-3 mr-1" /> Destino Final
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {points.map((pt, i) => (
                  <Card key={i} className="p-3 border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs font-semibold">{pt.label}</span>
                      {/* Segment distance */}
                      {i > 0 && segmentDistances[i - 1] > 0 && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <ArrowRight className="h-2.5 w-2.5" />
                          {segmentDistances[i - 1].toFixed(1)} km
                        </span>
                      )}
                      <div className="ml-auto flex gap-1">
                        <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => getGPS(i)} disabled={gpsLoading === i}>
                          {gpsLoading === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Locate className="h-3 w-3" />}
                          GPS
                        </Button>
                        {points.length > 1 && (
                          <Button size="sm" variant="ghost" className="h-6" onClick={() => removePoint(i)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="col-span-3">
                        <Input placeholder="Rua" value={pt.street} onChange={e => setPointField(i, "street", e.target.value)} className="text-xs h-8" />
                      </div>
                      <div>
                        <Input placeholder="Nº" value={pt.number} onChange={e => setPointField(i, "number", e.target.value)} className="text-xs h-8" />
                      </div>
                      <div>
                        <Input placeholder="Código Postal" value={pt.postal_code} onChange={e => setPointField(i, "postal_code", e.target.value)} className="text-xs h-8" />
                      </div>
                      <div>
                        <Input placeholder="Cidade" value={pt.city} onChange={e => setPointField(i, "city", e.target.value)} className="text-xs h-8" />
                      </div>
                      <div className="col-span-2">
                        <Input placeholder="País" value={pt.country} onChange={e => setPointField(i, "country", e.target.value)} className="text-xs h-8" />
                      </div>
                    </div>
                    {(pt.latitude || pt.longitude) && (
                      <p className="text-[10px] text-muted-foreground mt-1">📍 {pt.latitude}, {pt.longitude}</p>
                    )}
                  </Card>
                ))}
              </div>

              {/* GPS total distance */}
              {totalGpsDistance > 0 && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Navigation className="h-3 w-3" />
                  Distância GPS estimada: <span className="font-semibold text-foreground">{totalGpsDistance.toFixed(1)} km</span>
                </div>
              )}
            </div>

            {/* 4. Final KM + Notes */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>KM Fim {isActiveSession ? "*" : "(opcional)"}</Label>
                <Input type="number" value={form.km_end} onChange={e => setForm(p => ({ ...p, km_end: e.target.value }))} placeholder={isActiveSession ? "Obrigatório para finalizar" : "Deixar vazio se em curso"} />
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="h-9 min-h-[36px] text-sm" />
              </div>
            </div>

            {/* KM-based distance preview */}
            {form.km_start && form.km_end && parseFloat(form.km_end) > parseFloat(form.km_start) && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
                <span className="text-muted-foreground">Distância total (KM): </span>
                <span className="font-bold text-primary">{(parseFloat(form.km_end) - parseFloat(form.km_start)).toLocaleString()} km</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-between gap-2 pt-2">
            <Button variant="ghost" onClick={resetAndClose} className="text-muted-foreground">
              {isActiveSession ? "Fechar (manter ativo)" : "Cancelar"}
            </Button>
            <div className="flex gap-2">
              {!isActiveSession && (
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={!form.vehicle_id || !form.driver_id || !form.km_start || saveMutation.isPending}
                >
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Navigation className="h-4 w-4 mr-1" />}
                  Iniciar Trajeto
                </Button>
              )}
              {isActiveSession && (
                <Button
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    const kmEnd = parseFloat(form.km_end);
                    if (isNaN(kmEnd)) { toast.error("Insira o KM final para finalizar"); return; }
                    finalizeMutation.mutate({ id: resumingTripId!, km_end: kmEnd });
                  }}
                  disabled={finalizeMutation.isPending}
                >
                  {finalizeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                  Finalizar Trajeto
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Complete Dialog (from table) */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar Trajeto</DialogTitle>
            <DialogDescription>Insira a quilometragem final para concluir.</DialogDescription>
          </DialogHeader>
          <div><Label>KM Fim *</Label><Input type="number" value={completeKm} onChange={e => setCompleteKm(e.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => quickFinalize.mutate({ id: completeTripId, km_end: parseFloat(completeKm) })}
              disabled={!completeKm || quickFinalize.isPending}
            >
              {quickFinalize.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Finalizar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
