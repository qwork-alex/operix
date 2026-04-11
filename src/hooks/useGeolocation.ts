import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface GeoPoint {
  lat: number;
  lng: number;
  city?: string;
}

export function useGeolocation() {
  const { user } = useAuth();
  const [location, setLocation] = useState<GeoPoint | null>(null);

  useEffect(() => {
    if (!user || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const point: GeoPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        // Reverse geocode to get city name
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${point.lat}&lon=${point.lng}&format=json&zoom=10`,
            { headers: { "Accept-Language": "fr" } }
          );
          if (res.ok) {
            const data = await res.json();
            point.city =
              data.address?.city ||
              data.address?.town ||
              data.address?.village ||
              data.address?.municipality ||
              undefined;
          }
        } catch {
          // ignore geocoding errors
        }

        setLocation(point);

        // Store location as a notification-style log (lightweight, no new table needed)
        try {
          await supabase.from("backend_event_logs").insert({
            table_name: "geolocation",
            action: "CHECKIN",
            actor_user_id: user.id,
            payload: { lat: point.lat, lng: point.lng, city: point.city } as any,
          });
        } catch {
          // silent
        }
      },
      () => {
        // Permission denied or error — no-op
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, [user]);

  return location;
}
