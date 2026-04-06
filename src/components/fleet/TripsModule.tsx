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
import { Textarea } from "@/components/ui/textarea";
import { Save, Trash2, MapPin, Navigation, Loader2, CheckCircle, Locate, Plus, ArrowRight, Minus, Clock } from "lucide-react";

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
  distance_from_previous: number;
  duration_from_previous: number;
}

interface TripForm {
  vehicle_id: string;
  driver_id: string;
  date: string;
  km_start: string;
  km_end: string;
  notes: string;
}

const STORAGE_KEY = "fleet_active_trips";

const makePoint = (label: string): TripPoint => ({
  label, number: "", street: "", postal_code: "", city: "", country: "Portugal",
  latitude: "", longitude: "", distance_from_previous: 0, duration_from_previous: 0,
});

const defaultForm = (): TripForm => ({
  vehicle_id: "", driver_id: "", date: new Date().toISOString().slice(0, 10), km_start: "", km_end: "", notes: "",
});

/* ─── Session storage helpers (multi-trip) ─── */
interface TripSession {
  tripId: string;
  vehicleId: string;
  form: TripForm;
  points: TripPoint[];
  ts: number;
}

function loadSessions(): TripSession[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

function saveSessionToStorage(sessions: TripSession[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function upsertSession(tripId: string, vehicleId: string, form: TripForm, points: TripPoint[]) {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.tripId === tripId);
  const entry: TripSession = { tripId, vehicleId, form, points, ts: Date.now() };
  if (idx >= 0) sessions[idx] = entry; else sessions.push(entry);
  saveSessionToStorage(sessions);
}

function removeSession(tripId: string) {
  saveSessionToStorage(loadSessions().filter(s => s.tripId !== tripId));
}

/* ─── Route calculation via edge function ─── */
async function calculateRouteAPI(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  tripId?: string,
  pointIndex?: number,
): Promise<{ distance_km: number; duration_min: number }> {
  console.log("Coordenadas:", { origin, destination, tripId, pointIndex });
  const { data, error } = await supabase.functions.invoke("calculate-route", {
    body: { origin, destination, trip_id: tripId, point_index: pointIndex },
  });
  console.log("Resposta API:", data, error);
  if (error) throw new Error(`Erro ao calcular rota: ${error.message}`);
  if (data?.error) throw new Error(data.error);
  return { distance_km: data.distance_km, duration_min: data.duration_min };
}

/* ─── Calculate all segments for a trip ─── */
async function calculateAllSegments(
  tripId: string,
): Promise<{ totalDistance: number; totalDuration: number }> {
  const { data: pts, error } = await supabase
    .from("fleet_trip_points")
    .select("*")
    .eq("trip_id", tripId)
    .order("order_index");

  if (error || !pts || pts.length < 2) {
    console.log("Pontos insuficientes para cálculo:", pts?.length || 0);
    return { totalDistance: 0, totalDuration: 0 };
  }

  let totalDistance = 0;
  let totalDuration = 0;

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];

    if (!prev.latitude || !prev.longitude || !curr.latitude || !curr.longitude) {
      console.log(`Segmento ${i}: coordenadas em falta, a saltar`);
      continue;
    }

    // Skip if already calculated
    if (Number(curr.distance_from_previous) > 0) {
      totalDistance += Number(curr.distance_from_previous);
      totalDuration += Number(curr.duration_from_previous);
      continue;
    }

    try {
      const result = await calculateRouteAPI(
        { lat: Number(prev.latitude), lng: Number(prev.longitude) },
        { lat: Number(curr.latitude), lng: Number(curr.longitude) },
        tripId,
        curr.order_index,
      );
      totalDistance += result.distance_km;
      totalDuration += result.duration_min;
    } catch (err) {
      console.error(`Erro no segmento ${i}:`, err);
      // Use Haversine fallback
      const R = 6371;
      const dLat = (Number(curr.latitude) - Number(prev.latitude)) * Math.PI / 180;
      const dLon = (Number(curr.longitude) - Number(prev.longitude)) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(Number(prev.latitude) * Math.PI / 180) *
        Math.cos(Number(curr.latitude) * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
      const fallbackKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const fallbackMin = fallbackKm / 0.8; // rough estimate ~48km/h

      await supabase.from("fleet_trip_points").update({
        distance_from_previous: Math.round(fallbackKm * 100) / 100,
        duration_from_previous: Math.round(fallbackMin * 100) / 100,
      }).eq("id", (curr as any).id);

      totalDistance += fallbackKm;
      totalDuration += fallbackMin;
    }
  }

  return { totalDistance: Math.round(totalDistance * 10) / 10, totalDuration: Math.round(totalDuration * 10) / 10 };
}

/* ─── Component ─── */
export default function TripsModule() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [form, setForm] = useState<TripForm>(defaultForm());
  const [points, setPoints] = useState<TripPoint[]>([makePoint("Ponto de Partida")]);
  const [gpsLoading, setGpsLoading] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState<number | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);
  const [segmentsCache, setSegmentsCache] = useState<Record<string, any[]>>({});

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

  const activeTrips = trips.filter((t: any) => t.status === "in_progress");

  /* ─── Helpers ─── */
  const getVehicleLabel = (id: string) => {
    const v = vehicles.find((x: any) => x.id === id);
    return v ? `${v.brand || ""} ${v.model || ""} — ${v.license_plate}`.trim() : "—";
  };
  const getDriverName = (id: string) => {
    const d = drivers.find((x: any) => x.id === id);
    return d ? d.full_name : "—";
  };

  /* ─── Auto-save session ─── */
  useEffect(() => {
    if (open && activeTripId) {
      upsertSession(activeTripId, form.vehicle_id, form, points);
    }
  }, [form, points, open, activeTripId]);

  /* ─── Vehicle change ─── */
  const onVehicleChange = (vid: string) => {
    const existingTrip = activeTrips.find((t: any) => t.vehicle_id === vid);
    if (existingTrip && !activeTripId) {
      toast.error(`Este veículo já tem um trajeto ativo. Finalize-o primeiro.`);
      return;
    }
    const assignment = assignments.find((a: any) => a.vehicle_id === vid);
    setForm(p => ({ ...p, vehicle_id: vid, driver_id: assignment?.driver_id || "" }));
  };

  /* ─── GPS + Reverse Geocoding + Auto Route Calc ─── */
  const getGPS = useCallback(async (i: number) => {
    if (!navigator.geolocation) { toast.error("GPS indisponível neste dispositivo"); return; }
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

        // Auto-calculate route from previous point
        if (i > 0) {
          const prevPoint = points[i - 1];
          if (prevPoint.latitude && prevPoint.longitude) {
            setRouteLoading(i);
            try {
              const result = await calculateRouteAPI(
                { lat: parseFloat(prevPoint.latitude), lng: parseFloat(prevPoint.longitude) },
                { lat: parseFloat(lat), lng: parseFloat(lon) },
                activeTripId || undefined,
                i,
              );
              setPoints(p => p.map((pt, idx) => idx === i ? {
                ...pt, latitude: lat, longitude: lon,
                distance_from_previous: result.distance_km,
                duration_from_previous: result.duration_min,
              } : pt));
              toast.success(`Rota calculada: ${result.distance_km.toFixed(1)} km, ${Math.round(result.duration_min)} min`);
            } catch (err) {
              console.error("Route calc failed, using GPS coords only:", err);
            }
            setRouteLoading(null);
          }
        }
      },
      (err) => {
        const msg = err.code === 1 ? "Permissão GPS negada" : err.code === 2 ? "GPS indisponível" : "Tempo limite GPS esgotado";
        toast.error(msg);
        setGpsLoading(null);
      },
    );
  }, [points, activeTripId]);

  /* ─── Point management ─── */
  const addIntermediatePoint = () => {
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

  /* ─── Distance/Duration totals from API ─── */
  const totalApiDistance = points.reduce((s, pt) => s + (pt.distance_from_previous || 0), 0);
  const totalApiDuration = points.reduce((s, pt) => s + (pt.duration_from_previous || 0), 0);

  /* ─── Save / Start trip ─── */
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.vehicle_id) throw new Error("Selecione um veículo");
      if (!form.driver_id) throw new Error("Selecione um condutor");

      const existingActive = activeTrips.find((t: any) => t.vehicle_id === form.vehicle_id);
      if (existingActive) throw new Error(`Veículo já tem trajeto ativo. Finalize-o primeiro.`);

      const kmStart = form.km_start ? parseFloat(form.km_start) : null;

      const { data: trip, error } = await supabase.from("fleet_trips").insert({
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id,
        date: form.date,
        km_start: kmStart,
        status: "in_progress",
        notes: form.notes || null,
      }).select().single();
      if (error) throw new Error(`Falha ao criar trajeto: ${error.message}`);

      const tripId = (trip as any).id;
      setActiveTripId(tripId);

      const validPoints = points.filter(p => p.street || p.city || p.latitude);
      if (validPoints.length > 0) {
        const pointRows = validPoints.map((p, i) => ({
          trip_id: tripId,
          order_index: i,
          address: [p.number, p.street].filter(Boolean).join(" ") || null,
          postal_code: p.postal_code || null,
          city: p.city || null,
          latitude: p.latitude ? parseFloat(p.latitude) : null,
          longitude: p.longitude ? parseFloat(p.longitude) : null,
          distance_from_previous: p.distance_from_previous || 0,
          duration_from_previous: p.duration_from_previous || 0,
        }));
        await supabase.from("fleet_trip_points").insert(pointRows as any);
      }

      upsertSession(tripId, form.vehicle_id, form, points);
      return tripId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_trips"] });
      toast.success("Trajeto iniciado com sucesso");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  /* ─── Finalize trip ─── */
  const finalizeMutation = useMutation({
    mutationFn: async ({ id, km_end }: { id: string; km_end: number | null }) => {
      const trip = trips.find((t: any) => t.id === id);
      if (!trip) throw new Error("Trajeto não encontrado na base de dados");

      // Save final points
      const validPoints = points.filter(p => p.street || p.city || p.latitude);
      if (validPoints.length > 0 && activeTripId === id) {
        await supabase.from("fleet_trip_points").delete().eq("trip_id", id);
        const pointRows = validPoints.map((p, i) => ({
          trip_id: id,
          order_index: i,
          address: [p.number, p.street].filter(Boolean).join(" ") || null,
          postal_code: p.postal_code || null,
          city: p.city || null,
          latitude: p.latitude ? parseFloat(p.latitude) : null,
          longitude: p.longitude ? parseFloat(p.longitude) : null,
          distance_from_previous: p.distance_from_previous || 0,
          duration_from_previous: p.duration_from_previous || 0,
        }));
        await supabase.from("fleet_trip_points").insert(pointRows as any);
      }

      // Calculate totals from API distances
      const apiDist = points.reduce((s, pt) => s + (pt.distance_from_previous || 0), 0);
      const apiDur = points.reduce((s, pt) => s + (pt.duration_from_previous || 0), 0);

      let totalDist = apiDist;
      let finalKm = km_end;
      const kmStart = trip.km_start ? Number(trip.km_start) : null;

      // If manual KM provided and API distance is 0, use manual
      if (finalKm !== null && !isNaN(finalKm) && kmStart !== null) {
        if (finalKm < kmStart) throw new Error(`KM fim (${finalKm}) < KM início (${kmStart})`);
        if (totalDist === 0) totalDist = finalKm - kmStart;
      } else if (totalDist > 0 && kmStart !== null) {
        finalKm = Math.round(kmStart + totalDist);
      }

      const { error } = await supabase.from("fleet_trips").update({
        km_end: finalKm,
        status: "completed",
        total_distance: Math.round((totalDist || 0) * 10) / 10,
        total_duration: Math.round((apiDur || 0) * 10) / 10,
        notes: form.notes || null,
      }).eq("id", id);
      if (error) throw new Error(`Falha ao finalizar: ${error.message}`);

      removeSession(id);
      setActiveTripId(null);
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
    mutationFn: async ({ id, km_end }: { id: string; km_end: number | null }) => {
      const trip = trips.find((t: any) => t.id === id);
      if (!trip) throw new Error("Trajeto não encontrado");

      // Fetch saved trip points for API distances
      const { data: savedPoints } = await supabase
        .from("fleet_trip_points")
        .select("distance_from_previous, duration_from_previous")
        .eq("trip_id", id)
        .order("order_index");

      const apiDist = (savedPoints || []).reduce((s: number, p: any) => s + Number(p.distance_from_previous || 0), 0);
      const apiDur = (savedPoints || []).reduce((s: number, p: any) => s + Number(p.duration_from_previous || 0), 0);

      let totalDist = apiDist;
      let finalKm = km_end;
      const kmStart = trip.km_start ? Number(trip.km_start) : null;

      if (finalKm !== null && !isNaN(finalKm) && kmStart !== null) {
        if (finalKm < kmStart) throw new Error(`KM fim (${finalKm}) < KM início (${kmStart})`);
        if (totalDist === 0) totalDist = finalKm - kmStart;
      } else if (totalDist > 0 && kmStart !== null) {
        finalKm = Math.round(kmStart + totalDist);
      }

      const { error } = await supabase.from("fleet_trips").update({
        km_end: finalKm,
        status: "completed",
        total_distance: Math.round((totalDist || 0) * 10) / 10,
        total_duration: Math.round((apiDur || 0) * 10) / 10,
      }).eq("id", id);
      if (error) throw new Error(`Falha ao finalizar: ${error.message}`);
      removeSession(id);
      if (activeTripId === id) setActiveTripId(null);
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
      if (error) throw new Error(`Falha ao remover: ${error.message}`);
      removeSession(id);
      if (activeTripId === id) setActiveTripId(null);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet_trips"] }); toast.success("Trajeto removido"); },
  });

  const resetAndClose = () => {
    setOpen(false); setMinimized(false); setForm(defaultForm());
    setPoints([makePoint("Ponto de Partida")]); setActiveTripId(null);
  };

  const minimizeDialog = () => { setOpen(false); setMinimized(true); };
  const restoreDialog = () => { setMinimized(false); setOpen(true); };

  /* ─── Open / Resume trip ─── */
  const openTripDialog = (tripId?: string) => {
    if (tripId) {
      const trip = trips.find((t: any) => t.id === tripId);
      if (!trip) return;
      setForm({
        vehicle_id: trip.vehicle_id, driver_id: trip.driver_id, date: trip.date,
        km_start: trip.km_start ? String(trip.km_start) : "",
        km_end: trip.km_end ? String(trip.km_end) : "",
        notes: trip.notes || "",
      });
      setActiveTripId(tripId);
      const session = loadSessions().find(s => s.tripId === tripId);
      setPoints(session?.points?.length ? session.points : [makePoint("Ponto de Partida")]);
    } else {
      const f = defaultForm();
      if (assignments.length === 1) {
        f.vehicle_id = (assignments[0] as any).vehicle_id;
        f.driver_id = (assignments[0] as any).driver_id;
      }
      setForm(f);
      setPoints([makePoint("Ponto de Partida")]);
      setActiveTripId(null);
    }
    setMinimized(false);
    setOpen(true);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const tripId = (e as CustomEvent).detail?.tripId;
      if (tripId) openTripDialog(tripId);
      else { const first = trips.find((t: any) => t.status === "in_progress"); if (first) openTripDialog(first.id); }
    };
    window.addEventListener("fleet:resume-trip", handler);
    return () => window.removeEventListener("fleet:resume-trip", handler);
  }, [trips, assignments]);

  const isActiveSession = !!activeTripId;

  const formatDuration = (min: number) => {
    if (min < 60) return `${Math.round(min)} min`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return `${h}h${m > 0 ? ` ${m}min` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold">Trajetos</h2>
          <p className="text-xs text-muted-foreground">Cálculo automático de rotas via OpenRouteService</p>
        </div>
        <Button size="sm" onClick={() => openTripDialog()}>
          <Navigation className="h-4 w-4 mr-1" /> Iniciar Trajeto
        </Button>
      </div>

      {/* Minimized bar */}
      {minimized && activeTripId && (
        <div className="sticky top-0 z-40 flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 backdrop-blur-sm px-4 py-2 animate-fade-in shadow-sm cursor-pointer" onClick={restoreDialog}>
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Trajeto minimizado</span>
          <span className="text-xs text-muted-foreground">{getVehicleLabel(form.vehicle_id)}</span>
          {totalApiDistance > 0 && (
            <span className="text-xs font-semibold text-foreground">{totalApiDistance.toFixed(1)} km</span>
          )}
          <Button size="sm" variant="outline" className="ml-auto h-6 text-xs" onClick={(e) => { e.stopPropagation(); restoreDialog(); }}>
            Restaurar
          </Button>
        </div>
      )}

      {/* Trips Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Condutor</TableHead>
                <TableHead>Distância</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : trips.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum trajeto registrado</TableCell></TableRow>
              ) : trips.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell>{t.date}</TableCell>
                  <TableCell className="max-w-[140px] truncate">{getVehicleLabel(t.vehicle_id)}</TableCell>
                  <TableCell>{getDriverName(t.driver_id)}</TableCell>
                  <TableCell className="font-semibold tabular-nums">{t.total_distance ? `${Number(t.total_distance).toLocaleString()} km` : "—"}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{t.total_duration ? formatDuration(Number(t.total_duration)) : "—"}</TableCell>
                  <TableCell>
                    <Badge className={t.status === "completed" ? "bg-green-500/10 text-green-500" : "bg-blue-500/10 text-blue-500"}>
                      {t.status === "completed" ? "Concluído" : "Em curso"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {t.status === "in_progress" && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openTripDialog(t.id)}>
                          <Navigation className="h-3.5 w-3.5 mr-1" /> Continuar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setCompleteTripId(t.id); setCompleteKm(""); setCompleteOpen(true); }}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Finalizar
                        </Button>
                      </>
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

      {/* ─── Trip Dialog ─── */}
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{isActiveSession ? "Trajeto em Curso" : "Iniciar Trajeto"}</DialogTitle>
                <DialogDescription>
                  {isActiveSession ? "Continue a registar pontos. Distâncias calculadas automaticamente." : "Registe um novo trajeto com cálculo automático de rotas."}
                </DialogDescription>
              </div>
              <div className="flex gap-1">
                {isActiveSession && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={minimizeDialog} title="Minimizar">
                    <Minus className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={isActiveSession ? minimizeDialog : resetAndClose} title="Fechar">
                  <span className="text-lg leading-none">×</span>
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Início</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} disabled={isActiveSession} />
              </div>
              <div>
                <Label>KM Início (opcional)</Label>
                <Input type="number" value={form.km_start} onChange={e => setForm(p => ({ ...p, km_start: e.target.value }))} disabled={isActiveSession} placeholder="Opcional" />
              </div>
            </div>

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

            {/* Live accumulated distance/duration */}
            {totalApiDistance > 0 && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Navigation className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Distância acumulada:</span>
                  <span className="text-lg font-bold text-primary">{totalApiDistance.toFixed(1)} km</span>
                </div>
                {totalApiDuration > 0 && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Duração:</span>
                    <span className="text-sm font-semibold">{formatDuration(totalApiDuration)}</span>
                  </div>
                )}
              </div>
            )}

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
                      {i > 0 && pt.distance_from_previous > 0 && (
                        <span className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-0.5 bg-green-500/10 px-1.5 py-0.5 rounded">
                          <ArrowRight className="h-2.5 w-2.5" />
                          {pt.distance_from_previous.toFixed(1)} km · {Math.round(pt.duration_from_previous)} min
                        </span>
                      )}
                      {routeLoading === i && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Calculando rota...
                        </span>
                      )}
                      <div className="ml-auto flex gap-1">
                        <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => getGPS(i)} disabled={gpsLoading === i || routeLoading === i}>
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>KM Fim (opcional)</Label>
                <Input
                  type="number"
                  value={form.km_end}
                  onChange={e => setForm(p => ({ ...p, km_end: e.target.value }))}
                  placeholder={totalApiDistance > 0 ? `Auto: ~${totalApiDistance.toFixed(0)} km via API` : "Opcional"}
                />
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="h-9 min-h-[36px] text-sm" />
              </div>
            </div>
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="ghost" onClick={isActiveSession ? minimizeDialog : resetAndClose} className="text-muted-foreground">
              {isActiveSession ? "Minimizar" : "Cancelar"}
            </Button>
            <div className="flex gap-2">
              {!isActiveSession && (
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={!form.vehicle_id || !form.driver_id || saveMutation.isPending}
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
                    const kmEnd = form.km_end ? parseFloat(form.km_end) : null;
                    finalizeMutation.mutate({ id: activeTripId!, km_end: kmEnd });
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

      {/* Quick Complete Dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar Trajeto</DialogTitle>
            <DialogDescription>KM fim é opcional. A distância será calculada automaticamente pela API de rotas.</DialogDescription>
          </DialogHeader>
          <div><Label>KM Fim (opcional)</Label><Input type="number" value={completeKm} onChange={e => setCompleteKm(e.target.value)} placeholder="Opcional — usa cálculo da API" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => quickFinalize.mutate({ id: completeTripId, km_end: completeKm ? parseFloat(completeKm) : null })}
              disabled={quickFinalize.isPending}
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
