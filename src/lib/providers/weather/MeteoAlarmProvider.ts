/**
 * MeteoAlarm — open European severe-weather feed (no API key).
 * Filters thunderstorm (awareness_type=3) at orange/red level (>=3).
 * Mirrors the server-side implementation in ingest-hail; kept client-safe
 * so the same provider can be used for ad-hoc lookups or healthChecks.
 */
import type { NormalizedHailEvent, WeatherFetchCtx, WeatherProvider } from "./types";
import type { ProviderHealth } from "../registry";

const COUNTRY_MAP: Record<string, string> = {
  FR: "france", DE: "germany", ES: "spain", IT: "italy", BE: "belgium",
  NL: "netherlands", PT: "portugal", CH: "switzerland", AT: "austria", LU: "luxembourg",
};

function endpoint(region: string): string {
  const country = COUNTRY_MAP[region] ?? "france";
  return `https://feeds.meteoalarm.org/api/v1/warnings/feeds-${country}`;
}

function centroid(geom: any): { lat: number; lng: number } {
  let lat = 0, lng = 0, n = 0;
  const acc = (rings: any[]) => {
    for (const ring of rings) for (const [x, y] of ring) { lng += x; lat += y; n++; }
  };
  if (geom?.type === "Polygon") acc(geom.coordinates);
  else if (geom?.type === "MultiPolygon") for (const poly of geom.coordinates) acc(poly);
  return n ? { lat: lat / n, lng: lng / n } : { lat: 46.5, lng: 2.5 };
}

export const MeteoAlarmProvider: WeatherProvider = {
  key: "meteoalarm",
  name: "MeteoAlarm (EU)",
  priority: 20,
  enabled: true,
  capabilities: ["alerts", "hail", "severe"],

  async fetchHail(ctx: WeatherFetchCtx): Promise<NormalizedHailEvent[]> {
    const res = await fetch(endpoint(ctx.region), { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`MeteoAlarm ${ctx.region} ${res.status}`);
    const json = await res.json().catch(() => ({}));
    const warnings: any[] = json?.warnings ?? json?.features ?? [];
    const out: NormalizedHailEvent[] = [];
    for (const w of warnings) {
      const props = w.properties ?? w;
      const type = Number(props.awareness_type ?? props.awarenessType ?? 0);
      const level = Number(props.awareness_level ?? props.awarenessLevel ?? 0);
      if (type !== 3 || level < 3) continue;
      const { lat, lng } = centroid(w.geometry ?? props.geometry);
      out.push({
        source: "meteoalarm",
        externalId: String(props.identifier ?? props.id ?? w.id ?? `ma-${ctx.region}-${Date.now()}`),
        region: ctx.region, country: ctx.region,
        lat, lng, radiusKm: 80,
        severity: level >= 4 ? "extreme" : "severe",
        status: "forecast",
        probability: level >= 4 ? 0.85 : 0.65,
        intensity: level * 25,
        forecastTime: props.onset ?? props.effective ?? new Date().toISOString(),
        expiresAt: props.expires ?? new Date(Date.now() + 6 * 3600_000).toISOString(),
        metadata: { source_feed: "meteoalarm", level, type },
      });
    }
    return out;
  },

  async healthCheck(): Promise<ProviderHealth> {
    const t0 = Date.now();
    try {
      const res = await fetch(endpoint("FR"), { method: "HEAD" });
      return { ok: res.ok, latencyMs: Date.now() - t0, checkedAt: Date.now() };
    } catch (e) {
      return { ok: false, error: (e as Error).message, latencyMs: Date.now() - t0, checkedAt: Date.now() };
    }
  },
};
