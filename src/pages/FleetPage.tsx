import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Car, Users, Route, Fuel, FileText, BarChart3, Link2 } from "lucide-react";

import VehiclesModule from "@/components/fleet/VehiclesModule";
import DriversModule from "@/components/fleet/DriversModule";
import AssignmentsModule from "@/components/fleet/AssignmentsModule";
import TripsModule from "@/components/fleet/TripsModule";
import FuelLogsModule from "@/components/fleet/FuelLogsModule";
import FleetDocumentsModule from "@/components/fleet/FleetDocumentsModule";
import FleetReportsModule from "@/components/fleet/FleetReportsModule";

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
    queryFn: async () => { const { data } = await supabase.from("drivers" as any).select("*"); return (data || []) as any[]; },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["fleet_assignments"],
    queryFn: async () => { const { data } = await supabase.from("vehicle_assignments" as any).select("*").eq("status", "em_uso"); return (data || []) as any[]; },
  });

  const { data: trips = [] } = useQuery({
    queryKey: ["fleet_trips"],
    queryFn: async () => { const { data } = await supabase.from("fleet_trips" as any).select("*"); return (data || []) as any[]; },
  });

  const { data: fuelLogs = [] } = useQuery({
    queryKey: ["fleet_fuel_logs"],
    queryFn: async () => { const { data } = await supabase.from("fleet_fuel_logs" as any).select("*"); return (data || []) as any[]; },
  });

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
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs gap-1">
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="vehicles"><VehiclesModule /></TabsContent>
        <TabsContent value="drivers"><DriversModule /></TabsContent>
        <TabsContent value="assignments"><AssignmentsModule /></TabsContent>
        <TabsContent value="trips"><TripsModule /></TabsContent>
        <TabsContent value="fuel"><FuelLogsModule /></TabsContent>
        <TabsContent value="documents"><FleetDocumentsModule /></TabsContent>
        <TabsContent value="reports"><FleetReportsModule /></TabsContent>
      </Tabs>
    </div>
  );
}
