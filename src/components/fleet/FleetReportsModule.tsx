import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Route, Fuel, TrendingUp, FileText, Download, Printer, Share2, Eye,
  Plus, Car, User, Calendar, Loader2, ChevronRight
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────

function getWeekKey(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - day);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return `${sunday.toISOString().slice(0, 10)} → ${saturday.toISOString().slice(0, 10)}`;
}

function getMonthKey(dateStr: string) {
  return dateStr.slice(0, 7); // YYYY-MM
}

function formatMonth(key: string) {
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [y, m] = key.split("-");
  return `${months[parseInt(m) - 1]} ${y}`;
}

// ─── Calculation Engine ─────────────────────────────────────

interface CalcResult {
  totalTrips: number;
  totalKm: number;
  totalFuelCost: number;
  totalLiters: number;
  costPerKm: number;
  consumption: number; // L/100km
  avgKmPerTrip: number;
  totalDuration: number; // minutes
}

function computeKPIs(trips: any[], fuel: any[]): CalcResult {
  const totalTrips = trips.length;
  const totalKm = trips.reduce((s, t) => s + Number(t.total_distance || 0), 0);
  const totalFuelCost = fuel.reduce((s, f) => s + Number(f.total_cost || 0), 0);
  const totalLiters = fuel.reduce((s, f) => s + Number(f.liters || 0), 0);
  return {
    totalTrips,
    totalKm,
    totalFuelCost,
    totalLiters,
    costPerKm: totalKm > 0 ? totalFuelCost / totalKm : 0,
    consumption: totalKm > 0 ? (totalLiters / totalKm) * 100 : 0,
    avgKmPerTrip: totalTrips > 0 ? totalKm / totalTrips : 0,
  };
}

function computePerVehicle(trips: any[], fuel: any[], vehicles: any[]): {
  vehicleId: string; label: string; kpis: CalcResult
}[] {
  const vIds = new Set<string>();
  trips.forEach(t => vIds.add(t.vehicle_id));
  fuel.forEach(f => vIds.add(f.vehicle_id));

  return Array.from(vIds).map(vid => {
    const v = vehicles.find((x: any) => x.id === vid);
    const label = v ? `${v.brand || ""} ${v.model || ""} — ${v.license_plate}`.trim() : vid;
    return {
      vehicleId: vid,
      label,
      kpis: computeKPIs(
        trips.filter(t => t.vehicle_id === vid),
        fuel.filter(f => f.vehicle_id === vid)
      ),
    };
  }).sort((a, b) => b.kpis.totalKm - a.kpis.totalKm);
}

// ─── PDF Generation (HTML-to-Print) ─────────────────────────

function generateReportHTML(
  reportName: string,
  dateRange: string,
  globalKPIs: CalcResult,
  perVehicle: { label: string; kpis: CalcResult }[],
  weeklyData: [string, { km: number; fuel: number; trips: number; liters: number }][],
  tripsDetail: any[],
  getVehicleLabel: (id: string) => string,
  getDriverName: (id: string) => string,
) {
  const kpiRow = (label: string, value: string) => `<tr><td style="padding:4px 12px;color:#666">${label}</td><td style="padding:4px 12px;font-weight:600;text-align:right">${value}</td></tr>`;

  const vehicleRows = perVehicle.map(pv => `
    <tr>
      <td style="padding:4px 8px">${pv.label}</td>
      <td style="padding:4px 8px;text-align:right">${pv.kpis.totalTrips}</td>
      <td style="padding:4px 8px;text-align:right">${pv.kpis.totalKm.toLocaleString()} km</td>
      <td style="padding:4px 8px;text-align:right">${pv.kpis.totalLiters.toFixed(1)} L</td>
      <td style="padding:4px 8px;text-align:right">${pv.kpis.totalFuelCost.toFixed(2)} €</td>
      <td style="padding:4px 8px;text-align:right">${pv.kpis.costPerKm.toFixed(3)} €</td>
      <td style="padding:4px 8px;text-align:right">${pv.kpis.consumption.toFixed(1)}</td>
    </tr>
  `).join("");

  const weekRows = weeklyData.slice(0, 20).map(([week, d]) => `
    <tr>
      <td style="padding:4px 8px;font-family:monospace;font-size:11px">${week}</td>
      <td style="padding:4px 8px;text-align:right">${d.trips}</td>
      <td style="padding:4px 8px;text-align:right">${d.km.toLocaleString()}</td>
      <td style="padding:4px 8px;text-align:right">${d.liters.toFixed(1)}</td>
      <td style="padding:4px 8px;text-align:right">${d.fuel.toFixed(2)} €</td>
      <td style="padding:4px 8px;text-align:right">${d.km > 0 ? (d.fuel / d.km).toFixed(3) : "—"} €</td>
    </tr>
  `).join("");

  const tripRows = tripsDetail.slice(0, 100).map(t => `
    <tr>
      <td style="padding:3px 8px">${t.date}</td>
      <td style="padding:3px 8px">${getVehicleLabel(t.vehicle_id)}</td>
      <td style="padding:3px 8px">${getDriverName(t.driver_id)}</td>
      <td style="padding:3px 8px;text-align:right">${t.total_distance ? `${Number(t.total_distance).toLocaleString()} km` : "—"}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${reportName}</title>
<style>
  body{font-family:Arial,sans-serif;margin:20px;color:#222;font-size:12px}
  h1{font-size:18px;margin-bottom:2px}
  h2{font-size:14px;margin-top:24px;padding-bottom:4px;border-bottom:1px solid #ddd}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#f5f5f5;padding:6px 8px;text-align:left;font-size:11px;border-bottom:2px solid #ddd}
  td{border-bottom:1px solid #eee;font-size:11px}
  .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}
  .kpi-card{background:#f9f9f9;border-radius:6px;padding:10px}
  .kpi-label{font-size:10px;color:#888;text-transform:uppercase}
  .kpi-value{font-size:20px;font-weight:700;margin-top:2px}
  .subtitle{color:#888;font-size:12px}
  @media print{body{margin:10mm}}
</style></head><body>
<h1>${reportName}</h1>
<p class="subtitle">${dateRange} · Gerado em ${new Date().toLocaleDateString()}</p>

<h2>Resumo Global</h2>
<div class="kpi-grid">
  <div class="kpi-card"><div class="kpi-label">Trajetos</div><div class="kpi-value">${globalKPIs.totalTrips}</div></div>
  <div class="kpi-card"><div class="kpi-label">Distância Total</div><div class="kpi-value">${globalKPIs.totalKm.toLocaleString()} km</div></div>
  <div class="kpi-card"><div class="kpi-label">Combustível</div><div class="kpi-value">${globalKPIs.totalLiters.toFixed(1)} L</div></div>
  <div class="kpi-card"><div class="kpi-label">Custo Total</div><div class="kpi-value">${globalKPIs.totalFuelCost.toFixed(2)} €</div></div>
  <div class="kpi-card"><div class="kpi-label">Custo/km</div><div class="kpi-value">${globalKPIs.costPerKm.toFixed(3)} €</div></div>
  <div class="kpi-card"><div class="kpi-label">Consumo (L/100km)</div><div class="kpi-value">${globalKPIs.consumption.toFixed(1)}</div></div>
</div>

<h2>Por Veículo</h2>
<table>
  <thead><tr><th>Veículo</th><th style="text-align:right">Trajetos</th><th style="text-align:right">KM</th><th style="text-align:right">Litros</th><th style="text-align:right">Custo</th><th style="text-align:right">€/km</th><th style="text-align:right">L/100km</th></tr></thead>
  <tbody>${vehicleRows}</tbody>
</table>

<h2>Resumo Semanal</h2>
<table>
  <thead><tr><th>Semana</th><th style="text-align:right">Trajetos</th><th style="text-align:right">KM</th><th style="text-align:right">Litros</th><th style="text-align:right">Custo</th><th style="text-align:right">€/km</th></tr></thead>
  <tbody>${weekRows}</tbody>
</table>

<h2>Detalhe de Trajetos</h2>
<table>
  <thead><tr><th>Data</th><th>Veículo</th><th>Condutor</th><th style="text-align:right">Distância</th></tr></thead>
  <tbody>${tripRows}</tbody>
</table>

</body></html>`;
}

// ─── CSV Export ──────────────────────────────────────────────

function generateCSV(
  trips: any[],
  fuel: any[],
  getVehicleLabel: (id: string) => string,
  getDriverName: (id: string) => string,
) {
  const header = "Data,Veículo,Condutor,Distância (km),Litros,Custo (€),€/km\n";
  const tripLines = trips.map(t => {
    const km = Number(t.total_distance || 0);
    return `${t.date},"${getVehicleLabel(t.vehicle_id)}","${getDriverName(t.driver_id)}",${km},,,"`;
  }).join("\n");

  const fuelLines = fuel.map(f => {
    return `${f.date},"${getVehicleLabel(f.vehicle_id)}",,,"${Number(f.liters).toFixed(1)}","${Number(f.total_cost).toFixed(2)}",""`;
  }).join("\n");

  return header + tripLines + "\n" + fuelLines;
}

// ─── Main Component ─────────────────────────────────────────

export default function FleetReportsModule() {
  const qc = useQueryClient();
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [reportName, setReportName] = useState("Relatório Frota");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  // Data queries
  const { data: vehicles = [] } = useQuery({
    queryKey: ["fleet_vehicles"],
    queryFn: async () => { const { data } = await supabase.from("vehicles").select("*").order("license_plate"); return data || []; },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["fleet_drivers"],
    queryFn: async () => { const { data } = await supabase.from("drivers").select("*").order("full_name"); return (data || []) as any[]; },
  });

  const { data: trips = [] } = useQuery({
    queryKey: ["fleet_trips"],
    queryFn: async () => { const { data } = await supabase.from("fleet_trips").select("*").order("date", { ascending: false }); return (data || []) as any[]; },
  });

  const { data: fuelLogs = [] } = useQuery({
    queryKey: ["fleet_fuel_logs"],
    queryFn: async () => { const { data } = await supabase.from("fleet_fuel_logs").select("*").order("date", { ascending: false }); return (data || []) as any[]; },
  });

  // Lookups
  const getVehicleLabel = useCallback((id: string) => {
    const v = vehicles.find((x: any) => x.id === id);
    return v ? `${v.brand || ""} ${v.model || ""} — ${v.license_plate}`.trim() : "—";
  }, [vehicles]);

  const getDriverName = useCallback((id: string) => {
    const d = drivers.find((x: any) => x.id === id);
    return d ? d.full_name : "—";
  }, [drivers]);

  // Filtered data
  const filtered = useMemo(() => {
    let ft = [...trips];
    let ff = [...fuelLogs];
    if (vehicleFilter !== "all") {
      ft = ft.filter(t => t.vehicle_id === vehicleFilter);
      ff = ff.filter(f => f.vehicle_id === vehicleFilter);
    }
    if (driverFilter !== "all") {
      ft = ft.filter(t => t.driver_id === driverFilter);
    }
    if (periodFrom) {
      ft = ft.filter(t => t.date >= periodFrom);
      ff = ff.filter(f => f.date >= periodFrom);
    }
    if (periodTo) {
      ft = ft.filter(t => t.date <= periodTo);
      ff = ff.filter(f => f.date <= periodTo);
    }
    return { trips: ft, fuel: ff };
  }, [trips, fuelLogs, vehicleFilter, driverFilter, periodFrom, periodTo]);

  // Calculation engine
  const globalKPIs = useMemo(() => computeKPIs(filtered.trips, filtered.fuel), [filtered]);
  const perVehicle = useMemo(() => computePerVehicle(filtered.trips, filtered.fuel, vehicles), [filtered, vehicles]);

  // Weekly aggregation
  const weeklyData = useMemo(() => {
    const weeks: Record<string, { km: number; fuel: number; trips: number; liters: number }> = {};
    filtered.trips.forEach(t => {
      const key = getWeekKey(t.date);
      if (!weeks[key]) weeks[key] = { km: 0, fuel: 0, trips: 0, liters: 0 };
      weeks[key].km += Number(t.total_distance || 0);
      weeks[key].trips += 1;
    });
    filtered.fuel.forEach(f => {
      const key = getWeekKey(f.date);
      if (!weeks[key]) weeks[key] = { km: 0, fuel: 0, trips: 0, liters: 0 };
      weeks[key].fuel += Number(f.total_cost || 0);
      weeks[key].liters += Number(f.liters || 0);
    });
    return Object.entries(weeks).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // Monthly aggregation
  const monthlyData = useMemo(() => {
    const months: Record<string, { km: number; fuel: number; trips: number; liters: number }> = {};
    filtered.trips.forEach(t => {
      const key = getMonthKey(t.date);
      if (!months[key]) months[key] = { km: 0, fuel: 0, trips: 0, liters: 0 };
      months[key].km += Number(t.total_distance || 0);
      months[key].trips += 1;
    });
    filtered.fuel.forEach(f => {
      const key = getMonthKey(f.date);
      if (!months[key]) months[key] = { km: 0, fuel: 0, trips: 0, liters: 0 };
      months[key].fuel += Number(f.total_cost || 0);
      months[key].liters += Number(f.liters || 0);
    });
    return Object.entries(months).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // Date range label
  const dateRange = periodFrom || periodTo
    ? `${periodFrom || "início"} — ${periodTo || "hoje"}`
    : "Todo o período";

  // ─── Actions ────────────────────────────────────────────

  const buildHTML = useCallback(() => {
    return generateReportHTML(reportName, dateRange, globalKPIs, perVehicle, weeklyData, filtered.trips, getVehicleLabel, getDriverName);
  }, [reportName, dateRange, globalKPIs, perVehicle, weeklyData, filtered.trips, getVehicleLabel, getDriverName]);

  const handlePreview = () => {
    setPreviewHtml(buildHTML());
    setPreviewOpen(true);
  };

  const handlePrint = () => {
    const html = buildHTML();
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 800);
    }
  };

  const handleExportPDF = () => {
    // Uses print dialog to save as PDF
    handlePrint();
    toast.info("Use 'Guardar como PDF' na janela de impressão");
  };

  const handleExportCSV = () => {
    const csv = generateCSV(filtered.trips, filtered.fuel, getVehicleLabel, getDriverName);
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportName.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  const handleShare = () => {
    const html = buildHTML();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    navigator.clipboard.writeText(url).then(() => {
      toast.info("Link copiado. Para partilhar externamente, exporte como PDF.");
    });
  };

  // Auto report presets
  const setThisWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - day);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    setPeriodFrom(sunday.toISOString().slice(0, 10));
    setPeriodTo(saturday.toISOString().slice(0, 10));
    setReportName(`Relatório Semanal — ${sunday.toISOString().slice(0, 10)}`);
  };

  const setThisMonth = () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setPeriodFrom(first.toISOString().slice(0, 10));
    setPeriodTo(last.toISOString().slice(0, 10));
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    setReportName(`Relatório Mensal — ${months[now.getMonth()]} ${now.getFullYear()}`);
  };

  // ─── KPI Card ────────────────────────────────────────────

  const KPICard = ({ label, value, icon: Icon }: { label: string; value: string; icon: any }) => (
    <Card>
      <CardContent className="pt-3 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        </div>
        <p className="text-lg font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold">Relatórios</h2>
          <p className="text-xs text-muted-foreground">Motor de cálculo e relatórios automáticos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={setThisWeek}>
            <Calendar className="h-3.5 w-3.5 mr-1" /> Esta Semana
          </Button>
          <Button variant="outline" size="sm" onClick={setThisMonth}>
            <Calendar className="h-3.5 w-3.5 mr-1" /> Este Mês
          </Button>
        </div>
      </div>

      {/* Filters + Report Name */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <Label className="text-xs">Nome do Relatório</Label>
            <Input value={reportName} onChange={e => setReportName(e.target.value)} className="h-8" placeholder="Ex: Relatório Semanal S23" />
          </div>
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
          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap pt-1">
            <Button size="sm" onClick={handlePreview}>
              <Eye className="h-3.5 w-3.5 mr-1" /> Pré-visualizar
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportPDF}>
              <FileText className="h-3.5 w-3.5 mr-1" /> Exportar PDF
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportCSV}>
              <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
            </Button>
            <Button size="sm" variant="outline" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir
            </Button>
            <Button size="sm" variant="outline" onClick={handleShare}>
              <Share2 className="h-3.5 w-3.5 mr-1" /> Partilhar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <KPICard label="Trajetos" value={String(globalKPIs.totalTrips)} icon={Route} />
        <KPICard label="Distância" value={`${globalKPIs.totalKm.toLocaleString()} km`} icon={Route} />
        <KPICard label="Combustível" value={`${globalKPIs.totalLiters.toFixed(1)} L`} icon={Fuel} />
        <KPICard label="Custo Total" value={`${globalKPIs.totalFuelCost.toFixed(2)} €`} icon={TrendingUp} />
        <KPICard label="Custo/km" value={`${globalKPIs.costPerKm.toFixed(3)} €`} icon={BarChart3} />
        <KPICard label="L/100km" value={globalKPIs.consumption.toFixed(1)} icon={Fuel} />
        <KPICard label="km/trajeto" value={globalKPIs.avgKmPerTrip.toFixed(0)} icon={Route} />
      </div>

      {/* Tabs: Overview / Per Vehicle / Weekly / Monthly / Trips */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview" className="text-xs"><Car className="h-3 w-3 mr-1" /> Por Veículo</TabsTrigger>
          <TabsTrigger value="weekly" className="text-xs"><Calendar className="h-3 w-3 mr-1" /> Semanal</TabsTrigger>
          <TabsTrigger value="monthly" className="text-xs"><Calendar className="h-3 w-3 mr-1" /> Mensal</TabsTrigger>
          <TabsTrigger value="trips" className="text-xs"><Route className="h-3 w-3 mr-1" /> Trajetos</TabsTrigger>
        </TabsList>

        {/* Per Vehicle */}
        <TabsContent value="overview">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Veículo</TableHead>
                    <TableHead className="text-right">Trajetos</TableHead>
                    <TableHead className="text-right">KM</TableHead>
                    <TableHead className="text-right">Litros</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">€/km</TableHead>
                    <TableHead className="text-right">L/100km</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perVehicle.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground">Sem dados</TableCell></TableRow>
                  ) : perVehicle.map(pv => (
                    <TableRow key={pv.vehicleId}>
                      <TableCell className="font-medium text-xs">{pv.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{pv.kpis.totalTrips}</TableCell>
                      <TableCell className="text-right tabular-nums">{pv.kpis.totalKm.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{pv.kpis.totalLiters.toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{pv.kpis.totalFuelCost.toFixed(2)} €</TableCell>
                      <TableCell className="text-right tabular-nums">{pv.kpis.costPerKm.toFixed(3)} €</TableCell>
                      <TableCell className="text-right tabular-nums">{pv.kpis.consumption.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Weekly */}
        <TabsContent value="weekly">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Semana</TableHead>
                    <TableHead className="text-right">Trajetos</TableHead>
                    <TableHead className="text-right">KM</TableHead>
                    <TableHead className="text-right">Litros</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">€/km</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyData.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">Sem dados</TableCell></TableRow>
                  ) : weeklyData.map(([week, d]) => (
                    <TableRow key={week}>
                      <TableCell className="text-xs font-mono">{week}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.trips}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.km.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.liters.toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{d.fuel.toFixed(2)} €</TableCell>
                      <TableCell className="text-right tabular-nums">{d.km > 0 ? (d.fuel / d.km).toFixed(3) : "—"} €</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monthly */}
        <TabsContent value="monthly">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Trajetos</TableHead>
                    <TableHead className="text-right">KM</TableHead>
                    <TableHead className="text-right">Litros</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">€/km</TableHead>
                    <TableHead className="text-right">L/100km</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground">Sem dados</TableCell></TableRow>
                  ) : monthlyData.map(([month, d]) => (
                    <TableRow key={month}>
                      <TableCell className="font-medium">{formatMonth(month)}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.trips}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.km.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.liters.toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{d.fuel.toFixed(2)} €</TableCell>
                      <TableCell className="text-right tabular-nums">{d.km > 0 ? (d.fuel / d.km).toFixed(3) : "—"} €</TableCell>
                      <TableCell className="text-right tabular-nums">{d.km > 0 ? ((d.liters / d.km) * 100).toFixed(1) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trips Detail */}
        <TabsContent value="trips">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Condutor</TableHead>
                    <TableHead className="text-right">Distância</TableHead>
                    <TableHead className="text-right">KM Início</TableHead>
                    <TableHead className="text-right">KM Fim</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.trips.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">Sem trajetos</TableCell></TableRow>
                  ) : filtered.trips.slice(0, 100).map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.date}</TableCell>
                      <TableCell>{getVehicleLabel(t.vehicle_id)}</TableCell>
                      <TableCell>{getDriverName(t.driver_id)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {t.total_distance ? `${Number(t.total_distance).toLocaleString()} km` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{t.km_start ? Number(t.km_start).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.km_end ? Number(t.km_end).toLocaleString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Pré-visualização — {reportName}</DialogTitle>
            <DialogDescription>
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={handleExportPDF}><FileText className="h-3.5 w-3.5 mr-1" /> PDF</Button>
                <Button size="sm" variant="outline" onClick={handleExportCSV}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
                <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-3.5 w-3.5 mr-1" /> Imprimir</Button>
              </div>
            </DialogDescription>
          </DialogHeader>
          <iframe srcDoc={previewHtml} className="w-full h-[70vh] rounded border bg-white" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
