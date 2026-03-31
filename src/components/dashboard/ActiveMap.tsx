import { useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Skeleton } from "@/components/ui/skeleton";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// French city coordinates for geocoding platforms/addresses
const CITY_COORDS: Record<string, [number, number]> = {
  paris: [48.8566, 2.3522],
  lyon: [45.7640, 4.8357],
  marseille: [43.2965, 5.3698],
  toulouse: [43.6047, 1.4442],
  nice: [43.7102, 7.2620],
  nantes: [47.2184, -1.5536],
  strasbourg: [48.5734, 7.7521],
  montpellier: [43.6108, 3.8767],
  bordeaux: [44.8378, -0.5792],
  lille: [50.6292, 3.0573],
  rennes: [48.1173, -1.6778],
  grenoble: [45.1885, 5.7245],
  rouen: [49.4432, 1.0999],
  toulon: [43.1242, 5.9280],
  "clermont-ferrand": [45.7772, 3.0870],
  "le mans": [48.0061, 0.1996],
  dijon: [47.3220, 5.0415],
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
  techCount: number;
  orderCount: number;
}

export function ActiveMap() {
  const { t } = useLanguage();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  const { data: technicians = [] } = useQuery({
    queryKey: ["technicians-map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("technicians").select("id, name, email");
      if (error) throw error;
      return data;
    },
  });

  const { data: serviceOrders = [], isLoading } = useQuery({
    queryKey: ["service-orders-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id, platform, car_name, license_plate, technician_id")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const cities = useMemo<CityData[]>(() => {
    const cityMap: Record<string, { techIds: Set<string>; orderCount: number }> = {};

    for (const order of serviceOrders) {
      const text = [order.platform, order.car_name, order.license_plate].filter(Boolean).join(" ");
      const city = guessCityFromText(text);
      if (!city) continue;
      if (!cityMap[city]) cityMap[city] = { techIds: new Set(), orderCount: 0 };
      cityMap[city].orderCount++;
      if (order.technician_id) cityMap[city].techIds.add(order.technician_id);
    }

    // If no geo data found, place all activity at Paris as fallback
    if (Object.keys(cityMap).length === 0 && serviceOrders.length > 0) {
      cityMap["paris"] = { techIds: new Set(), orderCount: serviceOrders.length };
      for (const o of serviceOrders) {
        if (o.technician_id) cityMap["paris"].techIds.add(o.technician_id);
      }
    }

    return Object.entries(cityMap)
      .filter(([name]) => CITY_COORDS[name])
      .map(([name, data]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        coords: CITY_COORDS[name],
        techCount: data.techIds.size,
        orderCount: data.orderCount,
      }))
      .sort((a, b) => b.orderCount - a.orderCount);
  }, [serviceOrders]);

  useEffect(() => {
    if (!mapRef.current || isLoading) return;

    // Destroy previous map
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

    const maxOrders = Math.max(...cities.map(c => c.orderCount), 1);

    for (const city of cities) {
      const radius = Math.max(8, (city.orderCount / maxOrders) * 35);

      L.circleMarker(city.coords, {
        radius,
        color: "hsl(217, 91%, 60%)",
        fillColor: "hsl(217, 91%, 60%)",
        fillOpacity: 0.35,
        weight: 2,
      })
        .addTo(map)
        .bindPopup(
          `<div style="font-family:system-ui;font-size:12px;line-height:1.5">
            <strong>${city.name}</strong><br/>
            ${t("label.technician")}: <b>${city.techCount}</b><br/>
            ${t("label.services")}: <b>${city.orderCount}</b>
          </div>`,
          { className: "leaflet-dark-popup" }
        );
    }

    mapInstance.current = map;

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [cities, isLoading, t]);

  if (isLoading) {
    return <Skeleton className="h-[340px] rounded-xl" />;
  }

  return (
    <div className="glass-panel rounded-xl p-5 animate-fade-in">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{t("chart.activeRegions")}</h3>
        <p className="text-xs text-muted-foreground">{t("chart.techDistribution")}</p>
      </div>
      <div
        ref={mapRef}
        className="h-[280px] rounded-lg overflow-hidden"
        style={{ background: "hsl(var(--muted))" }}
      />
      {cities.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {cities.slice(0, 5).map(c => (
            <span key={c.name} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {c.name}: {c.orderCount} {t("label.services").toLowerCase()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
