import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Car, Users, Route, Fuel, FileText, BarChart3, Link2, Navigation } from "lucide-react";

import VehiclesModule from "@/components/fleet/VehiclesModule";
import DriversModule from "@/components/fleet/DriversModule";
import AssignmentsModule from "@/components/fleet/AssignmentsModule";
import TripsModule from "@/components/fleet/TripsModule";
import FuelLogsModule from "@/components/fleet/FuelLogsModule";
import FleetDocumentsModule from "@/components/fleet/FleetDocumentsModule";
import FleetReportsModule from "@/components/fleet/FleetReportsModule";

const TAB_COLORS: Record<string, string> = {
  vehicles: "hsl(40 60% 45%)",
  drivers: "hsl(35 55% 50%)",
  assignments: "hsl(30 50% 42%)",
  trips: "hsl(38 65% 48%)",
  fuel: "hsl(42 70% 50%)",
  documents: "hsl(32 45% 40%)",
  reports: "hsl(36 55% 46%)",
};

export default function FleetPage() {
  const { formatCurrency } = useLanguage();
  const [activeTab, setActiveTab] = useState("vehicles");

  const { data: vehicles = [] } = useQuery({
    queryKey: ["fleet_vehicles"],
    queryFn: async () => { const { data } = await supabase.from("vehicles").select("*"); return data || []; },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["fleet_drivers"],
    queryFn: async () => { const { data } = await supabase.from("drivers").select("*"); return (data || []) as any[]; },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["fleet_assignments"],
    queryFn: async () => { const { data } = await supabase.from("vehicle_assignments").select("*").eq("status", "em_uso"); return (data || []) as any[]; },
  });

  const { data: trips = [] } = useQuery({
    queryKey: ["fleet_trips"],
    queryFn: async () => { const { data } = await supabase.from("fleet_trips").select("*"); return (data || []) as any[]; },
  });

  const { data: fuelLogs = [] } = useQuery({
    queryKey: ["fleet_fuel_logs"],
    queryFn: async () => { const { data } = await supabase.from("fleet_fuel_logs").select("*"); return (data || []) as any[]; },
  });

  // Multiple active trips
  const activeTrips = trips.filter((t: any) => t.status === "in_progress");

  const getVehicleLabel = (id: string) => {
    const v = vehicles.find((x: any) => x.id === id);
    return v ? `${v.brand || ""} ${v.model || ""} — ${v.license_plate}`.trim() : "";
  };
  const getDriverName = (id: string) => {
    const d = drivers.find((x: any) => x.id === id);
    return d ? (d as any).full_name : "";
  };

  const totalKm = trips.reduce((s: number, t: any) => s + Number(t.total_distance || 0), 0);
  const totalFuelCost = fuelLogs.reduce((s: number, f: any) => s + Number(f.total_cost || 0), 0);
  const costPerKm = totalKm > 0 ? totalFuelCost / totalKm : 0;

  const kpis = [
    { label: "Veículos", value: String(vehicles.length), icon: Car },
    { label: "Condutores", value: String(drivers.length), icon: Users },
    { label: "Atribuições Ativas", value: String(assignments.length), icon: Link2 },
    { label: "Distância Total", value: `${totalKm.toLocaleString()} km`, icon: Route },
    { label: "Custo Combustível", value: formatCurrency(totalFuelCost), icon: Fuel, color: "text-destructive" },
    { label: "Custo/km", value: totalKm > 0 ? `${costPerKm.toFixed(3)} €/km` : "—", icon: BarChart3 },
  ];

  const tabs = [
    { value: "vehicles", label: "Veículos", icon: Car },
    { value: "drivers", label: "Condutores", icon: Users },
    { value: "assignments", label: "Atribuições", icon: Link2 },
    { value: "trips", label: "Trajetos", icon: Route },
    { value: "fuel", label: "Combustível", icon: Fuel },
    { value: "documents", label: "Documentos", icon: FileText },
    { value: "reports", label: "Relatórios", icon: BarChart3 },
  ];

  const handleResume = (tripId: string) => {
    setActiveTab("trips");
    setTimeout(() => window.dispatchEvent(new CustomEvent("fleet:resume-trip", { detail: { tripId } })), 100);
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 animate-fade-in md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Car className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Gestão de Frota</h1>
          <p className="text-xs text-muted-foreground">Registo • Operações • Inteligência</p>
        </div>
      </div>

      {/* Global Active Trip Bar(s) — supports multiple */}
      {activeTrips.map((trip: any) => (
        <div key={trip.id} className="sticky top-0 z-30 flex flex-col gap-3 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-3 shadow-sm backdrop-blur-sm animate-fade-in sm:flex-row sm:items-center sm:px-4">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-semibold text-green-600 dark:text-green-400">Trajeto em andamento</span>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {getVehicleLabel(trip.vehicle_id)} — {getDriverName(trip.driver_id)} — KM: {Number(trip.km_start).toLocaleString()}
          </span>
          <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto">
            <Button size="sm" variant="outline" className="h-10 text-xs sm:h-7" onClick={() => handleResume(trip.id)}>
              <Navigation className="h-3 w-3 mr-1" /> Continuar
            </Button>
            <Button size="sm" variant="default" className="h-10 text-xs bg-green-600 hover:bg-green-700 sm:h-7" onClick={() => handleResume(trip.id)}>
              Finalizar
            </Button>
          </div>
        </div>
      ))}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi) => (
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
      <div className="space-y-4">
        <div className="flex w-full gap-0.5 overflow-x-auto rounded-xl border border-border/30 bg-muted/40 p-1 md:overflow-visible">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.value;
            const color = TAB_COLORS[tab.value];
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`
                  relative min-w-[72px] flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-3
                  text-[13px] sm:text-sm font-semibold tracking-wide transition-all duration-300 ease-out
                  ${isActive ? "text-foreground shadow-md" : "text-muted-foreground hover:text-foreground/60"}
                `}
                style={isActive ? {
                  backgroundColor: `color-mix(in srgb, ${color} 15%, hsl(var(--card)))`,
                } : undefined}
              >
                <tab.icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" style={isActive ? { color } : undefined} />
                <span className="hidden sm:inline">{tab.label}</span>
                {isActive && (
                  <span
                    className="absolute bottom-0 left-[20%] right-[20%] h-[2px] rounded-full transition-all duration-300"
                    style={{ backgroundColor: color }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-2">
          {activeTab === "vehicles" && <VehiclesModule />}
          {activeTab === "drivers" && <DriversModule />}
          {activeTab === "assignments" && <AssignmentsModule />}
          {activeTab === "trips" && <TripsModule />}
          {activeTab === "fuel" && <FuelLogsModule />}
          {activeTab === "documents" && <FleetDocumentsModule />}
          {activeTab === "reports" && <FleetReportsModule />}
        </div>
      </div>
    </div>
  );
}
