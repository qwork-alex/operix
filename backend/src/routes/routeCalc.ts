import { Router, type Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

export const routeCalcRouter = Router();

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function normalizeCoordinates(body: any): [number,number][] {
  if (Array.isArray(body?.coordinates) && body.coordinates.length >= 2) {
    return body.coordinates
      .map((pair: unknown) => Array.isArray(pair) && pair.length === 2 ? [Number(pair[0]),Number(pair[1])] : null)
      .filter((pair: any): pair is [number,number] => Array.isArray(pair) && pair.every((v: any) => Number.isFinite(v)));
  }
  if (Number.isFinite(body?.origin?.lat) && Number.isFinite(body?.origin?.lng) && Number.isFinite(body?.destination?.lat) && Number.isFinite(body?.destination?.lng)) {
    return [[Number(body.origin.lng), Number(body.origin.lat)], [Number(body.destination.lng), Number(body.destination.lat)]];
  }
  return [];
}

/* POST /api/route/calculate */
routeCalcRouter.post("/calculate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const OPENROUTE_API_KEY = (process.env["OPENROUTE_API_KEY"] ?? "").trim();
    const body = req.body ?? {};
    const normalizedCoordinates = normalizeCoordinates(body);
    if (normalizedCoordinates.length < 2) return res.status(400).json({ error: "Missing route coordinates" });

    if (OPENROUTE_API_KEY) {
      const orsRes = await fetch("https://api.openrouteservice.org/v2/directions/driving-car", {
        method: "POST",
        headers: { Authorization: OPENROUTE_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: normalizedCoordinates }),
        signal: AbortSignal.timeout(10000),
      });
      if (orsRes.ok) {
        const orsData = await orsRes.json();
        const route = orsData.routes?.[0]; const summary = route?.summary;
        if (summary) {
          const distance_km = Number(summary.distance ?? 0) / 1000;
          const duration_min = Number(summary.duration ?? 0) / 60;
          const segments = Array.isArray(route?.segments) && route.segments.length > 0
            ? route.segments.map((s: any) => ({ distance_km: Number(s?.distance ?? 0)/1000, duration_min: Number(s?.duration ?? 0)/60 }))
            : [{ distance_km, duration_min }];
          return res.json({ distance_km, duration_min, segments });
        }
      }
    }

    // Haversine fallback
    const segments: { distance_km: number; duration_min: number }[] = [];
    let totalDist = 0, totalDur = 0;
    for (let i = 1; i < normalizedCoordinates.length; i++) {
      const [lon1,lat1] = normalizedCoordinates[i-1], [lon2,lat2] = normalizedCoordinates[i];
      const d = haversineKm(lat1,lon1,lat2,lon2)*1.3;
      const dur = d/50*60;
      segments.push({ distance_km: Math.round(d*100)/100, duration_min: Math.round(dur*100)/100 });
      totalDist += d; totalDur += dur;
    }
    res.json({ distance_km: Math.round(totalDist*100)/100, duration_min: Math.round(totalDur*100)/100, segments, fallback: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
  }
});

/* POST /api/route/geocode */
routeCalcRouter.post("/geocode", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { geocode_text } = req.body ?? {};
    if (!geocode_text) return res.status(400).json({ error: "Missing geocode_text" });
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geocode_text)}&limit=1&accept-language=pt`;
    const geocodeRes = await fetch(url, { headers: { "User-Agent": "QW-Nexus/1.0" }, signal: AbortSignal.timeout(8000) });
    if (!geocodeRes.ok) return res.status(502).json({ error: `Geocode API error: ${geocodeRes.status}` });
    const data = await geocodeRes.json();
    const first = Array.isArray(data) ? data[0] : null;
    if (!first?.lat || !first?.lon) return res.status(404).json({ error: "Address not found" });
    res.json({ latitude: Number(first.lat), longitude: Number(first.lon), label: first.display_name ?? geocode_text });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
  }
});
