import { useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Skeleton } from "@/components/ui/skeleton";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";

const CITY_COORDS: Record<string, [number, number]> = {
  paris: [48.8566, 2.3522],
  lyon: [45.764, 4.8357],
  marseille: [43.2965, 5.3698],
  toulouse: [43.6047, 1.4442],
  nice: [43.7102, 7.262],
  nantes: [47.2184, -1.5536],
  strasbourg: [48.5734, 7.7521],
  montpellier: [43.6108, 3.8767],
  bordeaux: [44.8378, -0.5792],
  lille: [50.6292, 3.0573],
  rennes: [48.1173, -1.6778],
  grenoble: [45.1885, 5.7245],
  rouen: [49.4432, 1.0999],
  toulon: [43.1242, 5.928],
  "clermont-ferrand": [45.7772, 3.087],
  "le mans": [48.0061, 0.1996],
  dijon: [47.322, 5.0415],
  angers: [47.4784, -0.5632],
  "saint-etienne": [45.4397, 4.3872],
  tours: [47.3941, 0.6848],
  geneve: [46.2044, 6.1432],
  geneva: [46.2044, 6.1432],
};

function guessCityFromText(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const city of Object.keys(CITY_COORDS)) {
    if (lower.includes(city)) return city;
  }
  return null;
}

interface CityData {
  name: string;
  coords: [number, number];
  orderCount: number;
}

const NEON_PURPLE = "#a855f7";

const clusterCss = `
.custom-cluster {
  background: radial-gradient(circle, rgba(168,85,247,0.45) 0%, rgba(168,85,247,0.1) 70%);
  border: 2px solid ${NEON_PURPLE};
  border-radius: 50%;
  box-shadow: 0 0 12px 4px rgba(168,85,247,0.5);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; font-size: 13px; font-family: system-ui;
}
.neon-marker {
  width: 14px; height: 14px; border-radius: 50%;
  background: ${NEON_PURPLE};
  border: 2px solid rgba(168,85,247,0.6);
  box-shadow: 0 0 10px 3px rgba(168,85,247,0.55);
}
.leaflet-dark-popup .leaflet-popup-content-wrapper {
  background: hsl(220,14%,11%); color: #e5e5e5; border: 1px solid hsl(220,12%,18%); border-radius: 8px;
}
.leaflet-dark-popup .leaflet-popup-tip { background: hsl(220,14%,11%); }
`;

export function ActiveMap() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  const { data: serviceOrders = [], isLoading } = useQuery({
    queryKey: ["service-orders-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id, platform, car_name, license_plate, technician_name")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  // Fetch geolocation checkins from backend_event_logs
  const { data: geoCheckins = [] } = useQuery({
    queryKey: ["geo-checkins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backend_event_logs")
        .select("payload, actor_user_id, created_at")
        .eq("table_name", "geolocation")
        .eq("action", "CHECKIN")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).filter((d: any) => d.payload?.lat && d.payload?.lng);
    },
  });

  const cities = useMemo<CityData[]>(() => {
    const cityMap: Record<string, number> = {};

    for (const order of serviceOrders) {
      const text = [order.platform, order.car_name, order.license_plate].filter(Boolean).join(" ");
      const city = guessCityFromText(text);
      if (!city) continue;
      cityMap[city] = (cityMap[city] || 0) + 1;
    }

    // No fallback to Paris — only show real data

    return Object.entries(cityMap)
      .filter(([name]) => CITY_COORDS[name])
      .map(([name, count]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        coords: CITY_COORDS[name],
        orderCount: count,
      }))
      .sort((a, b) => b.orderCount - a.orderCount);
  }, [serviceOrders]);

  useEffect(() => {
    if (!mapRef.current || isLoading) return;

    // Inject cluster CSS once
    if (!styleRef.current) {
      const s = document.createElement("style");
      s.textContent = clusterCss;
      document.head.appendChild(s);
      styleRef.current = s;
    }

    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const center: [number, number] = cities.length > 0 ? cities[0].coords : [46.6034, 2.3488];
    const map = L.map(mapRef.current, {
      center,
      zoom: 6,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 18,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    const clusterGroup = (L as any).markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster: any) => {
        const count = cluster.getChildCount();
        const size = count > 20 ? 50 : count > 5 ? 40 : 32;
        return L.divIcon({
          html: `<div class="custom-cluster" style="width:${size}px;height:${size}px">${count}</div>`,
          className: "",
          iconSize: L.point(size, size),
        });
      },
    });

    for (const city of cities) {
      for (let i = 0; i < city.orderCount; i++) {
        // Slight jitter so markers don't stack
        const jitter = () => (Math.random() - 0.5) * 0.02;
        const marker = L.marker([city.coords[0] + jitter(), city.coords[1] + jitter()], {
          icon: L.divIcon({
            html: '<div class="neon-marker"></div>',
            className: "",
            iconSize: L.point(14, 14),
            iconAnchor: L.point(7, 7),
          }),
        });

        marker.bindPopup(
          `<div style="font-family:system-ui;font-size:12px;line-height:1.5">
            <strong>${city.name}</strong><br/>
            ${t("label.services")}: <b>${city.orderCount}</b>
          </div>`,
          { className: "leaflet-dark-popup" }
        );

        clusterGroup.addLayer(marker);
      }
    }

    map.addLayer(clusterGroup);
    mapInstance.current = map;

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [cities, isLoading, t]);

  // Cleanup style on unmount
  useEffect(() => {
    return () => {
      if (styleRef.current) {
        styleRef.current.remove();
        styleRef.current = null;
      }
    };
  }, []);

  if (isLoading) {
    return <Skeleton className="h-[400px] rounded-xl" />;
  }

  return (
    <div className="glass-panel rounded-xl p-5 animate-fade-in">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{t("chart.activeRegions")}</h3>
        <p className="text-xs text-muted-foreground">{t("chart.techDistribution")}</p>
      </div>
      <div
        ref={mapRef}
        className="h-[350px] rounded-lg overflow-hidden"
        style={{ background: "hsl(var(--muted))" }}
      />
      {cities.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {cities.slice(0, 5).map((c) => (
            <span
              key={c.name}
              className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400"
            >
              {c.name}: {c.orderCount} {t("label.services").toLowerCase()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
