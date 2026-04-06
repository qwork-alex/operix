import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { BarChart3, Route, Fuel, TrendingUp } from "lucide-react";

function getWeekKey(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - day);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return `${sunday.toISOString().slice(0, 10)} → ${saturday.toISOString().slice(0, 10)}`;
}

export default function FleetReportsModule() {
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");

  const { data: vehicles = [] } = useQuery({
    queryKey: ["fleet_vehicles"],
    queryFn: async () => { const { data } = await supabase.from("vehicles").select("*").order("license_plate"); return data || []; },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["fleet_drivers"],
    queryFn: async () => { const { data } = await supabase.from("drivers" as any).select("*").order("full_name"); return (data || []) as any[]; },
  });

  const { data: trips = [] } = useQuery({
    queryKey: ["fleet_trips"],
    queryFn: async () => { const { data } = await supabase.from("fleet_trips" as any).select("*").order("date", { ascending: false }); return (data || []) as any[]; },
  });

  const { data: fuelLogs = [] } = useQuery({
    queryKey: ["fleet_fuel_logs"],
    queryFn: async () => { const { data } = await supabase.from("fleet_fuel_logs" as any).select("*").order("date", { ascending: false }); return (data || []) as any[]; },
  });

  const filtered = useMemo(() => {
    let ft = [...trips];
    let ff = [...fuelLogs];

    if (vehicleFilter !== "all") {
      ft = ft.filter((t: any) => t.vehicle_id === vehicleFilter);
      ff = ff.filter((f: any) => f.vehicle_id === vehicleFilter);
    }
    if (driverFilter !== "all") {
      ft = ft.filter((t: any) => t.driver_id === driverFilter);
    }
    if (periodFrom) {
      ft = ft.filter((t: any) => t.date >= periodFrom);
      ff = ff.filter((f: any) => f.date >= periodFrom);
    }
    if (periodTo) {
      ft = ft.filter((t: any) => t.date <= periodTo);
      ff = ff.filter((f: any) => f.date <= periodTo);
    }

    return { trips: ft, fuel: ff };
  }, [trips, fuelLogs, vehicleFilter, driverFilter, periodFrom, periodTo]);

  const totalKm = filtered.trips.reduce((s: number, t: any) => s + Number(t.total_distance || 0), 0);
  const totalFuelCost = filtered.fuel.reduce((s: number, f: any) => s + Number(f.total_cost || 0), 0);
  const totalLiters = filtered.fuel.reduce((s: number, f: any) => s + Number(f.liters || 0), 0);
  const costPerKm = totalKm > 0 ? totalFuelCost / totalKm : 0;
  const consumption = totalKm > 0 ? (totalLiters / totalKm) * 100 : 0;

  // Weekly aggregation
  const weeklyData = useMemo(() => {
    const weeks: Record<string, { km: number; fuel: number; trips: number; liters: number }> = {};
    filtered.trips.forEach((t: any) => {
      const key = getWeekKey(t.date);
      if (!weeks[key]) weeks[key] = { km: 0, fuel: 0, trips: 0, liters: 0 };
      weeks[key].km += Number(t.total_distance || 0);
      weeks[key].trips += 1;
    });
    filtered.fuel.forEach((f: any) => {
      const key = getWeekKey(f.date);
      if (!weeks[key]) weeks[key] = { km: 0, fuel: 0, trips: 0, liters: 0 };
      weeks[key].fuel += Number(f.total_cost || 0);
      weeks[key].liters += Number(f.liters || 0);
    });
    return Object.entries(weeks).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const getVehicleLabel = (id: string) => {
    const v = vehicles.find((x: any) => x.id === id);
    return v ? `${v.license_plate}` : "—";
  };

  const getDriverName = (id: string) => {
    const d = drivers.find((x: any) => x.id === id);
    return d ? d.full_name : "—";
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Relatórios</h2>
        <p className="text-xs text-muted-foreground">Análise de quilometragem, consumo e custos</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Veículo</Label>
              <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {vehicles.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.license_plate}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Condutor</Label>
              <Select value={driverFilter} onValueChange={setDriverFilter}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {drivers.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">De</Label><Input type="date" className="h-8" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} /></div>
            <div><Label className="text-xs">Até</Label><Input type="date" className="h-8" value={periodTo} onChange={e => setPeriodTo(e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Trajetos", value: String(filtered.trips.length), icon: Route },
          { label: "Distância Total", value: `${totalKm.toLocaleString()} km`, icon: Route },
          { label: "Combustível", value: `${totalLiters.toFixed(1)} L`, icon: Fuel },
          { label: "Custo Total", value: `${totalFuelCost.toFixed(2)} €`, icon: TrendingUp },
          { label: "Custo/km", value: `${costPerKm.toFixed(3)} €`, icon: BarChart3 },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="pt-3 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
              </div>
              <p className="text-lg font-bold tabular-nums">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Weekly Breakdown */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Resumo Semanal</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Semana</TableHead>
                <TableHead>Trajetos</TableHead>
                <TableHead>KM</TableHead>
                <TableHead>Litros</TableHead>
                <TableHead>Custo</TableHead>
                <TableHead>€/km</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeklyData.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">Sem dados</TableCell></TableRow>
              ) : weeklyData.map(([week, d]) => (
                <TableRow key={week}>
                  <TableCell className="text-xs font-mono">{week}</TableCell>
                  <TableCell>{d.trips}</TableCell>
                  <TableCell className="tabular-nums">{d.km.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums">{d.liters.toFixed(1)}</TableCell>
                  <TableCell className="tabular-nums font-semibold">{d.fuel.toFixed(2)} €</TableCell>
                  <TableCell className="tabular-nums">{d.km > 0 ? (d.fuel / d.km).toFixed(3) : "—"} €</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Trip Detail */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Detalhe de Trajetos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Condutor</TableHead>
                <TableHead>Distância</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.trips.slice(0, 50).map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell>{t.date}</TableCell>
                  <TableCell>{getVehicleLabel(t.vehicle_id)}</TableCell>
                  <TableCell>{getDriverName(t.driver_id)}</TableCell>
                  <TableCell className="tabular-nums font-semibold">{t.total_distance ? `${Number(t.total_distance).toLocaleString()} km` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
