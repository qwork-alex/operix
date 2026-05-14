import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Skeleton } from "@/components/ui/skeleton";
import maplibregl, { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Users, CloudRain, Zap, Radar, Wrench, FileText, Layers, X, AlertTriangle, Wind, Clock, Gauge } from "lucide-react";
import { OperationalPanel, PanelTeam, PanelOrder } from "./OperationalPanel";

/* ------------------------------------------------------------------ */
/*  Hail severity → premium color palette                              */
/* ------------------------------------------------------------------ */
const HAIL_COLORS = {
  low: "#eab308",       // yellow
  moderate: "#f97316",  // orange
  severe: "#ef4444",    // red
  extreme: "#a855f7",   // purple — extreme
} as const;
type HailSeverity = keyof typeof HAIL_COLORS;
type HailStatus = "forecast" | "ongoing" | "confirmed" | "closed";

interface HailEvent {
  id: string;
  source: string;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number;
  lng: number;
  radius_km: number;
  severity: HailSeverity;
  status: HailStatus;
  hail_size_mm: number | null;
  probability: number | null;
  intensity: number | null;
  storm_speed_kmh: number | null;
  storm_direction_deg: number | null;
  forecast_time: string | null;
  observed_time: string | null;
  expires_at: string | null;
  is_demo: boolean;
}

/* ------------------------------------------------------------------ */
/*  City heuristic (kept from previous map for fallback inference)     */
/* ------------------------------------------------------------------ */
const CITY_COORDS: Record<string, [number, number]> = {
  paris: [2.3522, 48.8566],
  lyon: [4.8357, 45.764],
  marseille: [5.3698, 43.2965],
  toulouse: [1.4442, 43.6047],
  nice: [7.262, 43.7102],
  nantes: [-1.5536, 47.2184],
  strasbourg: [7.7521, 48.5734],
  montpellier: [3.8767, 43.6108],
  bordeaux: [-0.5792, 44.8378],
  lille: [3.0573, 50.6292],
  rennes: [-1.6778, 48.1173],
  grenoble: [5.7245, 45.1885],
  rouen: [1.0999, 49.4432],
  toulon: [5.928, 43.1242],
  "clermont-ferrand": [3.087, 45.7772],
  "le mans": [0.1996, 48.0061],
  dijon: [5.0415, 47.322],
  angers: [-0.5632, 47.4784],
  "saint-etienne": [4.3872, 45.4397],
  tours: [0.6848, 47.3941],
  geneve: [6.1432, 46.2044],
  geneva: [6.1432, 46.2044],
};

function guessCityFromText(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const city of Object.keys(CITY_COORDS)) {
    if (lower.includes(city)) return city;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Dark premium MapLibre style (raster Carto Dark Matter)             */
/* ------------------------------------------------------------------ */
const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    "carto-dark": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap © CARTO",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "bg-ocean",
      type: "background",
      paint: { "background-color": "#0a1628" },
    },
    {
      id: "carto-dark",
      type: "raster",
      source: "carto-dark",
      paint: { "raster-opacity": 0.92, "raster-contrast": 0.05 },
    },
  ],
};

/* ------------------------------------------------------------------ */
/*  Layer config                                                       */
/* ------------------------------------------------------------------ */
type LayerKey = "teams" | "orders" | "operations" | "radar" | "storms" | "hail";

const LAYER_DEFS: { key: LayerKey; label: string; icon: any; color: string }[] = [
  { key: "teams", label: "Equipes", icon: Users, color: "#22d3ee" },
  { key: "orders", label: "Ordens", icon: FileText, color: "#a855f7" },
  { key: "operations", label: "Operações", icon: Wrench, color: "#f59e0b" },
  { key: "radar", label: "Radar", icon: Radar, color: "#3b82f6" },
  { key: "storms", label: "Tempestades", icon: Zap, color: "#eab308" },
  { key: "hail", label: "Granizo", icon: CloudRain, color: "#ef4444" },
];

/* ------------------------------------------------------------------ */
/*  Pulse CSS (injected once)                                          */
/* ------------------------------------------------------------------ */
const MAP_CSS = `
.maplibregl-ctrl-attrib { background: rgba(10,22,40,0.6) !important; color: #94a3b8 !important; font-size: 9px; }
.maplibregl-ctrl-attrib a { color: #cbd5e1 !important; }
.maplibregl-popup-content { background: hsl(220 14% 11%); color: #e5e5e5; border: 1px solid hsl(220 12% 18%); border-radius: 8px; font-family: system-ui; font-size: 12px; padding: 10px 12px; }
.maplibregl-popup-tip { border-top-color: hsl(220 14% 11%) !important; border-bottom-color: hsl(220 14% 11%) !important; }
.op-pulse { position: relative; }
.op-pulse::after {
  content: ""; position: absolute; inset: -6px; border-radius: 50%;
  border: 2px solid currentColor; opacity: 0.6;
  animation: opPulse 2s ease-out infinite;
}
@keyframes opPulse {
  0% { transform: scale(0.6); opacity: 0.7; }
  100% { transform: scale(1.8); opacity: 0; }
}
.op-marker {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.85);
  box-shadow: 0 0 12px 3px currentColor;
}
.op-cluster {
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; color: #fff; font-weight: 700; font-size: 12px;
  font-family: system-ui; border: 2px solid currentColor;
  background: radial-gradient(circle, rgba(255,255,255,0.12), rgba(0,0,0,0.4));
  box-shadow: 0 0 14px 4px currentColor;
}
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export function OperationalMap() {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const radarTimerRef = useRef<number | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    teams: true,
    orders: true,
    operations: false,
    radar: true,
    storms: false,
    hail: false,
  });

  /* -------- data: service orders (orders + operations inferred) ----- */
  const { data: serviceOrders = [], isLoading: loadingSO } = useQuery({
    queryKey: ["op-map-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id, platform, car_name, license_plate, technician_name, created_at, status")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  /* -------- data: geo checkins (teams) ------------------------------ */
  const { data: geoCheckins = [], isLoading: loadingGeo } = useQuery({
    queryKey: ["op-map-geo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backend_event_logs")
        .select("payload, actor_user_id, created_at")
        .eq("table_name", "geolocation")
        .eq("action", "CHECKIN")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []).filter((d: any) => d.payload?.lat && d.payload?.lng);
    },
  });

  /* -------- data: hail events (operational weather intel) ----------- */
  const queryClient = useQueryClient();
  const { data: hailEvents = [] } = useQuery<HailEvent[]>({
    queryKey: ["op-map-hail"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hail_events")
        .select("*")
        .neq("status", "closed")
        .order("forecast_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HailEvent[];
    },
    staleTime: 60_000,
  });

  // Realtime: refresh on any hail_events change
  useEffect(() => {
    const ch = supabase
      .channel("op-map-hail-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "hail_events" }, () => {
        queryClient.invalidateQueries({ queryKey: ["op-map-hail"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const [selectedHailId, setSelectedHailId] = useState<string | null>(null);
  const selectedHail = useMemo(
    () => hailEvents.find((h) => h.id === selectedHailId) ?? null,
    [hailEvents, selectedHailId]
  );
  /* -------- GeoJSON sources ----------------------------------------- */
  const ordersGeo = useMemo(() => {
    const features: any[] = [];
    for (const o of serviceOrders) {
      const text = [o.platform, o.car_name, o.license_plate].filter(Boolean).join(" ");
      const city = guessCityFromText(text);
      if (!city) continue;
      const [lng, lat] = CITY_COORDS[city];
      // small jitter
      const jx = (Math.random() - 0.5) * 0.04;
      const jy = (Math.random() - 0.5) * 0.04;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng + jx, lat + jy] },
        properties: {
          id: o.id,
          city: city.charAt(0).toUpperCase() + city.slice(1),
          platform: o.platform ?? "",
          plate: o.license_plate ?? "",
          status: o.status ?? "",
        },
      });
    }
    return { type: "FeatureCollection", features };
  }, [serviceOrders]);

  const teamsGeo = useMemo(() => {
    const features = geoCheckins.map((c: any) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.payload.lng, c.payload.lat] },
      properties: {
        city: c.payload.city ?? "Check-in",
        when: new Date(c.created_at).toLocaleDateString(),
      },
    }));
    return { type: "FeatureCollection", features };
  }, [geoCheckins]);

  const operationsGeo = useMemo(() => {
    // PDR ops = service orders flagged as in-progress; same city inference
    const features = (ordersGeo.features as any[]).filter(
      (f) => String(f.properties.status).toLowerCase().includes("progress") ||
             String(f.properties.status).toLowerCase().includes("andamento") ||
             String(f.properties.status).toLowerCase().includes("aberta")
    );
    return { type: "FeatureCollection", features };
  }, [ordersGeo]);

  const hailGeo = useMemo(() => {
    const features = hailEvents.map((h) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [h.lng, h.lat] },
      properties: {
        id: h.id,
        severity: h.severity,
        status: h.status,
        radius_km: h.radius_km,
        color: HAIL_COLORS[h.severity] ?? HAIL_COLORS.low,
        // pixel radius scales softly with severity; kept modest for performance
        size_factor:
          h.severity === "extreme" ? 28 :
          h.severity === "severe" ? 22 :
          h.severity === "moderate" ? 16 : 12,
      },
    }));
    return { type: "FeatureCollection", features };
  }, [hailEvents]);

  /* -------- Init map ------------------------------------------------ */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    if (!styleRef.current) {
      const s = document.createElement("style");
      s.textContent = MAP_CSS;
      document.head.appendChild(s);
      styleRef.current = s;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [2.3522, 46.6034],
      zoom: 4.8,
      attributionControl: { compact: true },
      maxZoom: 18,
      minZoom: 2,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => {
      /* ---- Empty sources & layers; populated by data effect -------- */
      const addClusterLayer = (id: string, color: string) => {
        map.addSource(id, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] } as any,
          cluster: true,
          clusterRadius: 50,
          clusterMaxZoom: 12,
        });
        map.addLayer({
          id: `${id}-clusters`,
          type: "circle",
          source: id,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": color,
            "circle-opacity": 0.25,
            "circle-stroke-color": color,
            "circle-stroke-width": 2,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16, 10, 22, 50, 30,
            ],
          },
        });
        map.addLayer({
          id: `${id}-cluster-count`,
          type: "symbol",
          source: id,
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-size": 12,
          },
          paint: { "text-color": "#ffffff" },
        });
        map.addLayer({
          id: `${id}-points`,
          type: "circle",
          source: id,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": color,
            "circle-radius": 6,
            "circle-stroke-color": "rgba(255,255,255,0.9)",
            "circle-stroke-width": 1.5,
            "circle-blur": 0.15,
          },
        });
        // soft glow halo
        map.addLayer(
          {
            id: `${id}-glow`,
            type: "circle",
            source: id,
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": color,
              "circle-radius": 16,
              "circle-opacity": 0.18,
              "circle-blur": 1,
            },
          },
          `${id}-points`
        );
      };

      addClusterLayer("orders", "#a855f7");
      addClusterLayer("teams", "#22d3ee");
      addClusterLayer("operations", "#f59e0b");

      /* ---- Hail cells (real data, severity-colored, not clustered) ---- */
      map.addSource("hail", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] } as any,
      });
      // Outer pulse halo
      map.addLayer({
        id: "hail-halo",
        type: "circle",
        source: "hail",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["*", ["get", "size_factor"], 1.6],
          "circle-opacity": 0.18,
          "circle-blur": 1,
        },
      });
      // Mid ring
      map.addLayer({
        id: "hail-ring",
        type: "circle",
        source: "hail",
        paint: {
          "circle-color": "transparent",
          "circle-radius": ["get", "size_factor"],
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0.85,
        },
      });
      // Core
      map.addLayer({
        id: "hail-core",
        type: "circle",
        source: "hail",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["max", 5, ["/", ["get", "size_factor"], 3]],
          "circle-stroke-color": "rgba(255,255,255,0.9)",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.9,
        },
      });

      /* ---- Click popup ---- */
      const popupHandler = (sourceId: string) => (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties || {};
        const html = sourceId === "teams"
          ? `<strong>${p.city}</strong><br/>${p.when}`
          : `<strong>${p.city || "—"}</strong><br/>${p.platform || ""} ${p.plate || ""}<br/><span style="opacity:.7">${p.status || ""}</span>`;
        new maplibregl.Popup({ closeButton: false, offset: 12 })
          .setLngLat(f.geometry.coordinates)
          .setHTML(html)
          .addTo(map);
      };
      ["orders", "teams", "operations"].forEach((id) => {
        map.on("click", `${id}-points`, popupHandler(id));
        map.on("mouseenter", `${id}-points`, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", `${id}-points`, () => (map.getCanvas().style.cursor = ""));
        // cluster zoom-in
        map.on("click", `${id}-clusters`, async (e: any) => {
          const f = e.features?.[0];
          if (!f) return;
          const src = map.getSource(id) as GeoJSONSource;
          const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id);
          map.easeTo({ center: f.geometry.coordinates, zoom });
        });
      });

      /* ---- Hail click → open detail panel ---- */
      const onHailClick = (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        setSelectedHailId(f.properties.id);
        map.easeTo({ center: f.geometry.coordinates, duration: 600 });
      };
      ["hail-core", "hail-ring", "hail-halo"].forEach((id) => {
        map.on("click", id, onHailClick);
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
      });
      setMapReady(true);
    });

    mapRef.current = map;

    return () => {
      if (radarTimerRef.current) window.clearTimeout(radarTimerRef.current);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  /* -------- Push data into sources --------------------------------- */
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    (map.getSource("orders") as GeoJSONSource | undefined)?.setData(ordersGeo as any);
    (map.getSource("teams") as GeoJSONSource | undefined)?.setData(teamsGeo as any);
    (map.getSource("operations") as GeoJSONSource | undefined)?.setData(operationsGeo as any);
  }, [mapReady, ordersGeo, teamsGeo, operationsGeo]);

  // Push hail data
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    (mapRef.current.getSource("hail") as GeoJSONSource | undefined)?.setData(hailGeo as any);
  }, [mapReady, hailGeo]);

  /* -------- Toggle layer visibility -------------------------------- */
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const setVis = (id: string, vis: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis ? "visible" : "none");
    };
    (["orders", "teams", "operations"] as const).forEach((k) => {
      setVis(`${k}-clusters`, layers[k]);
      setVis(`${k}-cluster-count`, layers[k]);
      setVis(`${k}-points`, layers[k]);
      setVis(`${k}-glow`, layers[k]);
    });
    // Hail layers
    ["hail-halo", "hail-ring", "hail-core"].forEach((id) => setVis(id, layers.hail));
  }, [layers, mapReady]);

  /* -------- RainViewer radar layer --------------------------------- */
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    let cancelled = false;

    const cleanupRaster = () => {
      ["radar-layer", "storms-layer"].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      ["radar-src", "storms-src"].forEach((id) => {
        if (map.getSource(id)) map.removeSource(id);
      });
    };

    const wantsRaster = layers.radar || layers.storms;
    if (!wantsRaster) {
      cleanupRaster();
      return;
    }

    (async () => {
      try {
        const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
        const json = await res.json();
        if (cancelled) return;
        const frames = json?.radar?.past ?? [];
        const last = frames[frames.length - 1];
        if (!last) return;
        const host = json.host as string;
        if (layers.radar && !map.getSource("radar-src")) {
          map.addSource("radar-src", {
            type: "raster",
            tiles: [`${host}${last.path}/256/{z}/{x}/{y}/2/1_1.png`],
            tileSize: 256,
          });
          map.addLayer({
            id: "radar-layer",
            type: "raster",
            source: "radar-src",
            paint: { "raster-opacity": 0.55 },
          }, "hail-halo");
        }
        if (layers.storms && !map.getSource("storms-src")) {
          map.addSource("storms-src", {
            type: "raster",
            tiles: [`${host}${last.path}/256/{z}/{x}/{y}/7/1_1.png`],
            tileSize: 256,
          });
          map.addLayer({
            id: "storms-layer",
            type: "raster",
            source: "storms-src",
            paint: { "raster-opacity": 0.65 },
          }, "hail-halo");
        }
      } catch (e) {
        console.warn("[OperationalMap] radar fetch failed", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [layers.radar, layers.storms, mapReady]);

  const toggleLayer = useCallback((k: LayerKey) => {
    setLayers((prev) => ({ ...prev, [k]: !prev[k] }));
  }, []);

  const isLoading = loadingSO || loadingGeo;

  return (
    <div className="glass-panel rounded-xl p-5 animate-fade-in">
      <div className="mb-3 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-400" />
            {t("chart.activeRegions") || "Centro Operacional"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("chart.techDistribution") || "Equipes, ordens e clima em tempo real"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LAYER_DEFS.map(({ key, label, icon: Icon, color }) => {
            const active = layers[key];
            return (
              <button
                key={key}
                onClick={() => toggleLayer(key)}
                className="text-[10px] px-2 py-1 rounded-md border transition-all flex items-center gap-1"
                style={{
                  borderColor: active ? color : "hsl(220 12% 22%)",
                  background: active ? `${color}22` : "transparent",
                  color: active ? color : "hsl(var(--muted-foreground))",
                  boxShadow: active ? `0 0 8px ${color}55` : "none",
                }}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && !mapReady ? (
        <Skeleton className="h-[400px] rounded-lg" />
      ) : (
        <div
          ref={containerRef}
          className="h-[420px] rounded-lg overflow-hidden relative"
          style={{ background: "#0a1628" }}
        />
      )}

      {/* -------- Hail event detail panel -------- */}
      {selectedHail && (
        <HailDetailPanel
          event={selectedHail}
          onClose={() => setSelectedHailId(null)}
        />
      )}
    </div>
  );
}

/* ====================================================================== */
/*  Detail Panel — opens below the map when a hail cell is clicked         */
/* ====================================================================== */
const STATUS_LABEL: Record<HailStatus, string> = {
  forecast: "Previsto",
  ongoing: "Em andamento",
  confirmed: "Confirmado",
  closed: "Encerrado",
};
const SEVERITY_LABEL: Record<HailSeverity, string> = {
  low: "Baixo risco",
  moderate: "Moderado",
  severe: "Severo",
  extreme: "Extremo",
};
const STATUS_DOT: Record<HailStatus, string> = {
  forecast: "bg-amber-400",
  ongoing: "bg-orange-500 animate-pulse",
  confirmed: "bg-red-500 animate-pulse",
  closed: "bg-zinc-500",
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

function HailDetailPanel({ event, onClose }: { event: HailEvent; onClose: () => void }) {
  const color = HAIL_COLORS[event.severity];
  return (
    <div
      className="mt-4 rounded-xl p-4 animate-fade-in border relative"
      style={{
        background: "linear-gradient(135deg, rgba(15,23,42,0.85), rgba(15,23,42,0.6))",
        borderColor: `${color}55`,
        boxShadow: `0 0 24px ${color}22, inset 0 0 1px ${color}55`,
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-1 rounded-md hover:bg-white/10 text-muted-foreground"
        aria-label="Fechar"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 mb-3">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center"
          style={{ background: `${color}22`, border: `1px solid ${color}66` }}
        >
          <AlertTriangle className="h-5 w-5" style={{ color }} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-foreground truncate">
              {event.city || "—"}{event.region ? `, ${event.region}` : ""}{event.country ? ` · ${event.country}` : ""}
            </h4>
            {event.is_demo && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-300">DEMO</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] flex-wrap">
            <span className="flex items-center gap-1.5" style={{ color }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              {SEVERITY_LABEL[event.severity]}
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[event.status]}`} />
              {STATUS_LABEL[event.status]}
            </span>
            <span className="text-muted-foreground/70">fonte: {event.source}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric icon={<Gauge className="h-3 w-3" />} label="Tamanho est." value={event.hail_size_mm ? `${event.hail_size_mm} mm` : "—"} />
        <Metric icon={<AlertTriangle className="h-3 w-3" />} label="Probabilidade" value={event.probability != null ? `${Math.round(event.probability * 100)}%` : "—"} />
        <Metric icon={<Zap className="h-3 w-3" />} label="Intensidade" value={event.intensity != null ? `${Math.round(event.intensity)}/100` : "—"} />
        <Metric icon={<Wind className="h-3 w-3" />} label="Velocidade" value={event.storm_speed_kmh ? `${event.storm_speed_kmh} km/h` : "—"} />
        <Metric icon={<Clock className="h-3 w-3" />} label="Previsto" value={fmtTime(event.forecast_time)} />
        <Metric icon={<Clock className="h-3 w-3" />} label="Observado" value={fmtTime(event.observed_time)} />
        <Metric icon={<Clock className="h-3 w-3" />} label="Expira" value={fmtTime(event.expires_at)} />
        <Metric icon={<Radar className="h-3 w-3" />} label="Raio" value={`${event.radius_km} km`} />
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg px-2.5 py-1.5 bg-white/[0.03] border border-white/5">
      <div className="text-[10px] text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="text-xs font-medium text-foreground mt-0.5">{value}</div>
    </div>
  );
}
