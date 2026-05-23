import { supabase } from "@/integrations/supabase/client";

/**
 * Reusable fleet trip operations used by both TripsModule and the
 * global FloatingTripButton. Keeps DB/route-calc logic in one place
 * so the floating button can act from any page without mounting
 * the full TripsModule.
 */

export interface GpsPointResult {
  latitude: number;
  longitude: number;
  street: string;
  number: string;
  postal_code: string;
  city: string;
  country: string;
  display_address: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getCurrentGpsWithAddress(): Promise<GpsPointResult> {
  if (!navigator.geolocation) throw new Error("GPS indisponível");
  const pos = await new Promise<GeolocationPosition>((res, rej) =>
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 })
  );
  const latitude = Number(pos.coords.latitude.toFixed(6));
  const longitude = Number(pos.coords.longitude.toFixed(6));

  const point: GpsPointResult = {
    latitude, longitude,
    street: "", number: "", postal_code: "", city: "", country: "",
    display_address: `${latitude}, ${longitude}`,
  };

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=pt`
    );
    if (res.ok) {
      const data = await res.json();
      const a = data.address || {};
      point.street = a.road || a.pedestrian || "";
      point.number = a.house_number || "";
      point.postal_code = a.postcode || "";
      point.city = a.city || a.town || a.village || a.municipality || "";
      point.country = a.country || "";
      const parts = [
        [point.number, point.street].filter(Boolean).join(" "),
        point.postal_code,
        point.city,
        point.country,
      ].filter(Boolean);
      if (parts.length) point.display_address = parts.join(", ");
    }
  } catch {
    // keep coord-only fallback
  }
  return point;
}

/** Append a checkpoint (no route recalc — kept fast for live use). */
export async function registerCheckpoint(tripId: string): Promise<GpsPointResult> {
  const gps = await getCurrentGpsWithAddress();

  const { data: existing } = await supabase
    .from("fleet_trip_points")
    .select("order_index")
    .eq("trip_id", tripId)
    .order("order_index", { ascending: false })
    .limit(1);

  const nextIndex = existing && existing.length ? Number(existing[0].order_index) + 1 : 0;

  const { error } = await supabase.from("fleet_trip_points").insert({
    trip_id: tripId,
    order_index: nextIndex,
    address: [gps.number, gps.street].filter(Boolean).join(" ") || null,
    postal_code: gps.postal_code || null,
    city: gps.city || null,
    latitude: gps.latitude,
    longitude: gps.longitude,
    distance_from_previous: 0,
    duration_from_previous: 0,
  } as any);
  if (error) throw new Error(error.message);

  return gps;
}

/** Capture current GPS as the final destination AND finalize the trip. */
export async function finalizeTripWithCurrentGps(tripId: string): Promise<void> {
  // 1. add the final GPS point
  await registerCheckpoint(tripId);

  // 2. load all points and trip
  const { data: trip } = await supabase.from("fleet_trips").select("*").eq("id", tripId).single();
  if (!trip) throw new Error("Trajeto não encontrado");

  const { data: pts } = await supabase
    .from("fleet_trip_points")
    .select("*")
    .eq("trip_id", tripId)
    .order("order_index");

  if (!pts || pts.length < 2) {
    // still finalize, just mark done
    await supabase.from("fleet_trips").update({ status: "completed" }).eq("id", tripId);
    return;
  }

  // 3. compute segments via edge function (resilient — if one fails, fall back to 0 for that leg)
  let totalKm = 0;
  let totalMin = 0;
  for (let i = 1; i < pts.length; i++) {
    const a: any = pts[i - 1];
    const b: any = pts[i];
    if (![a.latitude, a.longitude, b.latitude, b.longitude].every((v) => v !== null && v !== undefined)) continue;
    try {
      const { data, error } = await supabase.functions.invoke("calculate-route", {
        body: { coordinates: [[Number(a.longitude), Number(a.latitude)], [Number(b.longitude), Number(b.latitude)]] },
      });
      if (error) throw error;
      const km = round2(Number(data?.distance_km || 0));
      const min = round2(Number(data?.duration_min || 0));
      await supabase
        .from("fleet_trip_points")
        .update({ distance_from_previous: km, duration_from_previous: min })
        .eq("id", b.id);
      totalKm += km;
      totalMin += min;
    } catch (err) {
      console.warn("Segment calc failed", err);
    }
  }

  const kmStart = (trip as any).km_start ? Number((trip as any).km_start) : null;
  const kmEnd = kmStart !== null && totalKm > 0 ? Math.round(kmStart + totalKm) : null;

  await supabase.from("fleet_trips").update({
    status: "completed",
    total_distance: round2(totalKm),
    total_duration: round2(totalMin),
    ...(kmEnd !== null ? { km_end: kmEnd } : {}),
  }).eq("id", tripId);

  // cleanup local session
  try {
    const KEY = "fleet_active_trips";
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    localStorage.setItem(KEY, JSON.stringify(list.filter((s: any) => s.tripId !== tripId)));
  } catch {
    // ignore
  }
}
