/**
 * NOAA / NWS — open US severe-weather alerts (no API key).
 * Pulls "Severe Thunderstorm Warning" alerts; extracts hail size from
 * `parameters.maxHailSize` when present.
 */
import type { NormalizedHailEvent, WeatherFetchCtx, WeatherProvider } from "./types";
import type { ProviderHealth } from "../registry";

const ENDPOINT =
  "https://api.weather.gov/alerts/active?event=Severe%20Thunderstorm%20Warning";

function severityFromMm(mm: number | null): NormalizedHailEvent["severity"] {
  if (mm == null) return "moderate";
  if (mm >= 50) return "extreme";
  if (mm >= 25) return "severe";
  if (mm >= 12) return "moderate";
  return "low";
}

export const NOAAProvider: WeatherProvider = {
  key: "noaa",
  name: "NOAA / NWS (US)",
  priority: 20,
  enabled: true,
  capabilities: ["alerts", "hail", "severe"],

  async fetchHail(_ctx: WeatherFetchCtx): Promise<NormalizedHailEvent[]> {
    const res = await fetch(ENDPOINT, { headers: { accept: "application/geo+json" } });
    if (!res.ok) throw new Error(`NOAA ${res.status}`);
    const json = await res.json();
    const out: NormalizedHailEvent[] = [];
    for (const f of (json?.features ?? [])) {
      const props = f.properties ?? {};
      const params = props.parameters ?? {};
      const sizeIn = parseFloat(String((params.maxHailSize ?? params.hailSize ?? [])[0] ?? "0")) || 0;
      const sizeMm = sizeIn ? sizeIn * 25.4 : null;

      let lat = 0, lng = 0, n = 0;
      if (f.geometry?.type === "Polygon") {
        for (const ring of f.geometry.coordinates)
          for (const [x, y] of ring) { lng += x; lat += y; n++; }
      }
      if (!n) continue;
      lng /= n; lat /= n;

      out.push({
        source: "noaa",
        externalId: props.id ?? f.id,
        city: props.areaDesc?.split(";")[0]?.trim() ?? null,
        country: "US",
        lat, lng, radiusKm: 30,
        severity: severityFromMm(sizeMm),
        status: "ongoing",
        hailSizeMm: sizeMm,
        probability: 0.9,
        intensity: Math.min(100, (sizeMm ?? 10) * 1.5),
        forecastTime: props.sent ?? null,
        observedTime: props.effective ?? null,
        expiresAt: props.expires ?? null,
        metadata: { headline: props.headline, severity: props.severity },
      });
    }
    return out;
  },

  async healthCheck(): Promise<ProviderHealth> {
    const t0 = Date.now();
    try {
      const res = await fetch(ENDPOINT, { method: "HEAD" });
      return { ok: res.ok, latencyMs: Date.now() - t0, checkedAt: Date.now() };
    } catch (e) {
      return { ok: false, error: (e as Error).message, latencyMs: Date.now() - t0, checkedAt: Date.now() };
    }
  },
};
