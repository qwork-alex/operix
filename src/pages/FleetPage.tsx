import { useState, useEffect } from "react";
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
  vehicles: "hsl(220 70% 50%)",
  drivers: "hsl(260 60% 55%)",
  assignments: "hsl(180 60% 40%)",
  trips: "hsl(140 55% 42%)",
  fuel: "hsl(35 90% 50%)",
  documents: "hsl(340 60% 50%)",
  reports: "hsl(200 70% 50%)",
};

export default function FleetPage() {
  const { formatCurrency } = useLanguage();
  const [activeTab, setActiveTab] = useState("vehicles");

  // KPI data
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

  // Active trip detection
  const activeTrip = trips.find((t: any) => t.status === "in_progress") || null;

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

  const handleResume = () => {
    setActiveTab("trips");
    setTimeout(() => window.dispatchEvent(new Event("fleet:resume-trip")), 100);
  };

  const handleFinalize = () => {
    setActiveTab("trips");
    setTimeout(() => window.dispatchEvent(new Event("fleet:resume-trip")), 100);
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
          <p className="text-xs text-muted-foreground">Registo • Operações • Inteligência</p>
        </div>
      </div>

      {/* Global Active Trip Bar */}
      {activeTrip && (
        <div className="sticky top-0 z-50 flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/5 backdrop-blur-sm px-4 py-3 animate-fade-in shadow-sm">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-semibold text-green-600 dark:text-green-400">Trajeto em andamento</span>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {getVehicleLabel(activeTrip.vehicle_id)} — {getDriverName(activeTrip.driver_id)} — KM: {Number(activeTrip.km_start).toLocaleString()}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleResume}>
              <Navigation className="h-3 w-3 mr-1" /> Continuar
            </Button>
            <Button size="sm" variant="default" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={handleFinalize}>
              Finalizar
            </Button>
          </div>
        </div>
      )}

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
        <div className="flex w-full rounded-xl bg-muted/50 p-1.5 gap-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.value;
            const color = TAB_COLORS[tab.value];
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`
                  relative flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5
                  text-sm font-medium transition-all duration-300 ease-out
                  ${isActive ? "text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/70"}
                `}
                style={isActive ? { backgroundColor: `color-mix(in srgb, ${color} 12%, hsl(var(--background)))` } : undefined}
              >
                <tab.icon className="h-4 w-4" style={isActive ? { color } : undefined} />
                <span className="hidden sm:inline">{tab.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full transition-all duration-300" style={{ backgroundColor: color }} />
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
