// ============================================================================
//  Weather Ingest — Provider Abstraction Layer
//  ----------------------------------------------------------------------------
//  Architecture:
//    - Provider registry persisted in `weather_providers`
//    - Each provider implements WeatherProvider { capabilities, fetch(region) }
//    - Engine: priority order, per-provider rate-limit window, response cache
//      (`weather_cache`), audit log (`weather_sync_runs`), automatic fallback
//    - Result is normalised into HailEvent[] and upserted into `hail_events`
//      using (source, external_id) as the dedupe key.
//
//  Activate paid providers by adding their secret (api_key_secret_name)
//  and flipping `enabled = true` on the matching weather_providers row.
// ============================================================================
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ---------------------------------------------------------------- types --- */
type Capability =
  | "hail" | "radar" | "precipitation" | "lightning"
  | "wind" | "alerts" | "severe" | "storm_cells";

type Severity = "low" | "moderate" | "severe" | "extreme";
type Status = "forecast" | "ongoing" | "confirmed" | "closed";

interface HailEvent {
  source: string;
  external_id: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  lat: number;
  lng: number;
  radius_km?: number;
  severity: Severity;
  status: Status;
  hail_size_mm?: number | null;
  probability?: number | null;
  intensity?: number | null;
  storm_speed_kmh?: number | null;
  storm_direction_deg?: number | null;
  forecast_time?: string | null;
  observed_time?: string | null;
  expires_at?: string | null;
  metadata?: Record<string, unknown>;
}

interface ProviderRow {
  key: string;
  name: string;
  enabled: boolean;
  priority: number;
  requires_api_key: boolean;
  api_key_secret_name: string | null;
  capabilities: Capability[];
  regions: string[];
  rate_limit_per_min: number;
  request_count_window: number;
  window_started_at: string | null;
}

interface FetchContext {
  apiKey?: string;
  regionKey: string;        // e.g. "FR", "US", "global"
  bbox?: [number, number, number, number]; // minLng,minLat,maxLng,maxLat
  cache: CacheStore;
}

interface WeatherProvider {
  key: string;
  capabilities: Capability[];
  fetchHail?(ctx: FetchContext): Promise<HailEvent[]>;
}

/* --------------------------------------------------------------- cache --- */
class CacheStore {
  constructor(private supabase: SupabaseClient) {}
  async get(key: string): Promise<unknown | null> {
    const { data } = await this.supabase
      .from("weather_cache")
      .select("payload, expires_at")
      .eq("cache_key", key)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    return data?.payload ?? null;
  }
  async set(args: {
    key: string; provider: string; capability: string;
    regionKey: string; payload: unknown; ttlSeconds: number;
  }) {
    const expires_at = new Date(Date.now() + args.ttlSeconds * 1000).toISOString();
    await this.supabase.from("weather_cache").upsert({
      cache_key: args.key,
      provider: args.provider,
      capability: args.capability,
      region_key: args.regionKey,
      payload: args.payload as any,
      expires_at,
    }, { onConflict: "cache_key" });
  }
}

/* ------------------------------------------------------ rate-limit gate --- */
async function reserveSlot(
  supabase: SupabaseClient, p: ProviderRow,
): Promise<boolean> {
  const now = Date.now();
  const winStart = p.window_started_at ? new Date(p.window_started_at).getTime() : 0;
  const insideWindow = now - winStart < 60_000;

  const newCount = insideWindow ? p.request_count_window + 1 : 1;
  if (insideWindow && newCount > p.rate_limit_per_min) return false;

  await supabase.from("weather_providers").update({
    request_count_window: newCount,
    window_started_at: insideWindow ? p.window_started_at : new Date().toISOString(),
  }).eq("key", p.key);
  return true;
}

async function recordCall(
  supabase: SupabaseClient, key: string,
  status: "ok" | "error" | "skipped", info: { count?: number; error?: string },
) {
  await supabase.from("weather_providers").update({
    last_called_at: new Date().toISOString(),
    last_status: status,
    last_error: info.error ?? null,
    last_event_count: info.count ?? null,
  }).eq("key", key);
}

/* ===========================================================================
 *  Provider implementations
 * ===========================================================================*/

/* ----- RainViewer (radar/precipitation, no key, global) ------------------ */
const RainViewer: WeatherProvider = {
  key: "rainviewer",
  capabilities: ["radar", "precipitation"],
  // RainViewer does not expose hail. Kept here so the engine can serve it
  // for the radar capability via the cache layer.
};

/* ----- MeteoAlarm (EU severe alerts incl. FR, no key) ------------------- */
//  Replaces the discontinued public MeteoFrance vigilance XML feed.
//  Uses the open MeteoAlarm v1 JSON API. Filters thunderstorm (awareness
//  type 3 — covers hail) at orange/red level (>= 3), computes centroids
//  from the GeoJSON polygons.
const MeteoFrance: WeatherProvider = {
  key: "meteofrance",
  capabilities: ["alerts", "hail", "severe"],
  async fetchHail(ctx) {
    const cacheKey = `mfalarm:${ctx.regionKey}`;
    const cached = await ctx.cache.get(cacheKey);
    if (cached) return cached as HailEvent[];

    const countryMap: Record<string, string> = {
      FR: "france", DE: "germany", ES: "spain", IT: "italy",
      BE: "belgium", NL: "netherlands", PT: "portugal", CH: "switzerland",
      AT: "austria", LU: "luxembourg",
    };
    const country = countryMap[ctx.regionKey] ?? "france";
    const url = `https://feeds.meteoalarm.org/api/v1/warnings/feeds-${country}`;

    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Lovable-OperationalMap (+nexus.qworkgroup.com)",
      },
    });
    if (!res.ok) throw new Error(`MeteoAlarm ${country} ${res.status}`);
    const json = await res.json().catch(() => ({}));

    const events: HailEvent[] = [];
    const warnings: any[] = json?.warnings ?? json?.features ?? [];
    for (const w of warnings) {
      const props = w.properties ?? w;
      const type = Number(props.awareness_type ?? props.awarenessType ?? 0);
      const level = Number(props.awareness_level ?? props.awarenessLevel ?? 0);
      if (type !== 3 || level < 3) continue;

      const sev: Severity = level >= 4 ? "extreme" : "severe";
      const geom = w.geometry ?? props.geometry;
      let lat = 46.5, lng = 2.5, n = 0;
      if (geom?.type === "Polygon") {
        n = 0; lat = 0; lng = 0;
        for (const ring of geom.coordinates) for (const [x, y] of ring) { lng += x; lat += y; n++; }
        if (n) { lng /= n; lat /= n; } else { lat = 46.5; lng = 2.5; }
      } else if (geom?.type === "MultiPolygon") {
        n = 0; lat = 0; lng = 0;
        for (const poly of geom.coordinates)
          for (const ring of poly)
            for (const [x, y] of ring) { lng += x; lat += y; n++; }
        if (n) { lng /= n; lat /= n; } else { lat = 46.5; lng = 2.5; }
      }

      const id =
        props.identifier ?? props.id ?? w.id ??
        `ma-${country}-${props.onset ?? props.effective ?? Date.now()}`;
      events.push({
        source: "meteofrance",
        external_id: String(id),
        city: null, region: country.toUpperCase(), country: ctx.regionKey,
        lat, lng, radius_km: 80,
        severity: sev,
        status: "forecast",
        probability: level >= 4 ? 0.85 : 0.65,
        intensity: level * 25,
        forecast_time: props.onset ?? props.effective ?? new Date().toISOString(),
        expires_at: props.expires ?? new Date(Date.now() + 6 * 3600_000).toISOString(),
        metadata: { source_feed: "meteoalarm", country, level, type },
      });
    }

    await ctx.cache.set({
      key: cacheKey, provider: "meteofrance", capability: "hail",
      regionKey: ctx.regionKey, payload: events, ttlSeconds: 600,
    });
    return events;
  },
};

/* ----- NOAA / NWS (severe alerts, no key, US) ---------------------------- */
const NOAA: WeatherProvider = {
  key: "noaa",
  capabilities: ["alerts", "hail", "severe", "storm_cells"],
  async fetchHail(ctx) {
    const cacheKey = `noaa:hail:${ctx.regionKey}`;
    const cached = await ctx.cache.get(cacheKey);
    if (cached) return cached as HailEvent[];

    // Active "Severe Thunderstorm Warning" alerts often include hail.
    const url = "https://api.weather.gov/alerts/active?event=Severe%20Thunderstorm%20Warning";
    const res = await fetch(url, {
      headers: { accept: "application/geo+json", "user-agent": "Lovable-OperationalMap (+nexus.qworkgroup.com)" },
    });
    if (!res.ok) throw new Error(`NOAA alerts ${res.status}`);
    const json = await res.json();

    const events: HailEvent[] = [];
    for (const f of (json?.features ?? [])) {
      const props = f.properties ?? {};
      const params = props.parameters ?? {};
      const sizeRaw = (params.maxHailSize ?? params.hailSize ?? [])[0];
      const sizeIn = parseFloat(String(sizeRaw ?? "0")) || 0;
      const sizeMm = sizeIn ? sizeIn * 25.4 : null;
      const sev: Severity =
        sizeMm == null ? "moderate" :
        sizeMm >= 50 ? "extreme" :
        sizeMm >= 25 ? "severe" :
        sizeMm >= 12 ? "moderate" : "low";

      // Centroid of the affected polygon (rough average)
      let lat = 0, lng = 0, n = 0;
      const geom = f.geometry;
      if (geom?.type === "Polygon") {
        for (const ring of geom.coordinates) for (const [x, y] of ring) { lng += x; lat += y; n++; }
      }
      if (!n) continue;
      lng /= n; lat /= n;

      events.push({
        source: "noaa",
        external_id: props.id ?? f.id,
        city: props.areaDesc?.split(";")[0]?.trim() ?? null,
        region: null, country: "US",
        lat, lng, radius_km: 30,
        severity: sev,
        status: "ongoing",
        hail_size_mm: sizeMm,
        probability: 0.9,
        intensity: Math.min(100, (sizeMm ?? 10) * 1.5),
        forecast_time: props.sent ?? null,
        observed_time: props.effective ?? null,
        expires_at: props.expires ?? null,
        metadata: { headline: props.headline, severity: props.severity },
      });
    }

    await ctx.cache.set({
      key: cacheKey, provider: "noaa", capability: "hail",
      regionKey: ctx.regionKey, payload: events, ttlSeconds: 300,
    });
    return events;
  },
};

/* ----- Environment Canada (severe alerts, no key, CA) -------------------- */
const EnvCanada: WeatherProvider = {
  key: "environment_canada",
  capabilities: ["alerts", "severe"],
  async fetchHail(_ctx) {
    // EC publishes per-region CAP feeds; full ingestion requires region
    // enumeration. Stubbed here — returns no events until region map added.
    return [];
  },
};

/* ----- Tomorrow.io (paid, global) ---------------------------------------- */
const TomorrowIo: WeatherProvider = {
  key: "tomorrowio",
  capabilities: ["hail", "precipitation", "wind", "lightning", "storm_cells"],
  async fetchHail(ctx) {
    if (!ctx.apiKey) return [];
    const cacheKey = `tio:hail:${ctx.regionKey}`;
    const cached = await ctx.cache.get(cacheKey);
    if (cached) return cached as HailEvent[];

    const bbox = ctx.bbox ?? [-5, 41, 10, 51]; // FR default
    const center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
    const url = `https://api.tomorrow.io/v4/weather/forecast?location=${center[1]},${center[0]}&apikey=${ctx.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Tomorrow.io ${res.status}`);
    const json = await res.json();

    const events: HailEvent[] = [];
    const hourly = json?.timelines?.hourly ?? [];
    for (const h of hourly.slice(0, 24)) {
      const v = h.values ?? {};
      const hail = v.hailBinary ?? 0;
      if (!hail) continue;
      const sizeMm = (v.hailSize ?? 10) * 1;
      const sev: Severity =
        sizeMm >= 50 ? "extreme" : sizeMm >= 25 ? "severe" :
        sizeMm >= 12 ? "moderate" : "low";
      events.push({
        source: "tomorrowio",
        external_id: `tio-${center[1]}-${center[0]}-${h.time}`,
        lat: center[1], lng: center[0], radius_km: 25,
        severity: sev, status: "forecast",
        hail_size_mm: sizeMm,
        probability: (v.precipitationProbability ?? 50) / 100,
        intensity: Math.min(100, sizeMm * 1.5),
        storm_speed_kmh: v.windSpeed ? v.windSpeed * 3.6 : null,
        storm_direction_deg: v.windDirection ?? null,
        forecast_time: h.time,
        expires_at: new Date(new Date(h.time).getTime() + 3600_000).toISOString(),
        metadata: { source_values: v },
      });
    }

    await ctx.cache.set({
      key: cacheKey, provider: "tomorrowio", capability: "hail",
      regionKey: ctx.regionKey, payload: events, ttlSeconds: 600,
    });
    return events;
  },
};

/* ----- OpenWeather (paid; alerts/precipitation) -------------------------- */
const OpenWeather: WeatherProvider = {
  key: "openweather",
  capabilities: ["precipitation", "wind", "alerts"],
};

/* ----- WeatherAPI (paid; alerts) ----------------------------------------- */
const WeatherAPI: WeatherProvider = {
  key: "weatherapi",
  capabilities: ["alerts", "precipitation", "wind"],
};

/* --------------------------------------------------------------- registry */
const PROVIDERS: Record<string, WeatherProvider> = {
  rainviewer: RainViewer,
  meteofrance: MeteoFrance,
  noaa: NOAA,
  environment_canada: EnvCanada,
  tomorrowio: TomorrowIo,
  openweather: OpenWeather,
  weatherapi: WeatherAPI,
};

/* -------- France department centroid lookup (subset, expandable) -------- */
const FR_DEPARTMENT_COORDS: Record<string, [number, number]> = {
  "01": [5.35, 46.20], "13": [5.39, 43.30], "31": [1.44, 43.60], "33": [-0.58, 44.84],
  "35": [-1.68, 48.12], "38": [5.72, 45.19], "44": [-1.55, 47.22], "59": [3.06, 50.63],
  "62": [2.78, 50.52], "67": [7.75, 48.57], "69": [4.83, 45.76], "75": [2.35, 48.86],
  "76": [1.10, 49.44], "83": [6.13, 43.42], "87": [1.27, 45.83], "06": [7.27, 43.71],
};

/* =================================================================== HTTP */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const cache = new CacheStore(supabase);

    const url = new URL(req.url);
    const regionParam = url.searchParams.get("region") ?? "all";
    const onlyKey = url.searchParams.get("provider"); // optional single provider
    // When region=all, iterate every enabled provider using its native region.
    const isAll = regionParam.toLowerCase() === "all";

    /* ---- Load provider registry sorted by priority ---- */
    let q = supabase.from("weather_providers")
      .select("*").eq("enabled", true).order("priority", { ascending: true });
    if (onlyKey) q = q.eq("key", onlyKey);
    const { data: rows, error: regErr } = await q;
    if (regErr) throw regErr;

    const allEvents: HailEvent[] = [];
    const providerStatus: Record<string, string> = {};
    const seen = new Set<string>(); // dedupe across providers

    for (const row of (rows ?? []) as ProviderRow[]) {
      const provider = PROVIDERS[row.key];
      if (!provider?.fetchHail) {
        providerStatus[row.key] = "no_implementation";
        await recordCall(supabase, row.key, "skipped", { error: "no_impl" });
        continue;
      }

      // Skip providers requiring a key when secret is missing
      let apiKey: string | undefined;
      if (row.requires_api_key) {
        apiKey = row.api_key_secret_name ? Deno.env.get(row.api_key_secret_name) ?? undefined : undefined;
        if (!apiKey) {
          providerStatus[row.key] = "no_api_key";
          await recordCall(supabase, row.key, "skipped", { error: "no_api_key" });
          continue;
        }
      }

      // Region scope: when isAll, pick the provider's first concrete region
      // (or "global"); otherwise honour the explicit ?region= filter.
      let regionKey = regionParam;
      if (isAll) {
        regionKey = row.regions.find((r) => r !== "global") ?? "global";
      } else if (!row.regions.includes("global") && !row.regions.includes(regionParam)) {
        providerStatus[row.key] = `region_skip:${regionParam}`;
        continue;
      }

      // Rate-limit reservation
      const ok = await reserveSlot(supabase, row);
      if (!ok) {
        providerStatus[row.key] = "rate_limited";
        await recordCall(supabase, row.key, "skipped", { error: "rate_limited" });
        continue;
      }

      const startedAt = Date.now();
      try {
        const events = await provider.fetchHail({ apiKey, regionKey, cache });
        const fresh = events.filter((e) => {
          const id = `${e.source}|${e.external_id}`;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        allEvents.push(...fresh);
        providerStatus[row.key] = `ok:${fresh.length}`;
        await recordCall(supabase, row.key, "ok", { count: fresh.length });
        await supabase.from("weather_sync_runs").insert({
          provider: row.key, region_key: regionKey, capability: "hail",
          ok: true, events_upserted: fresh.length,
          duration_ms: Date.now() - startedAt,
        });
      } catch (err) {
        const msg = (err as Error).message;
        providerStatus[row.key] = `error:${msg}`;
        await recordCall(supabase, row.key, "error", { error: msg });
        await supabase.from("weather_sync_runs").insert({
          provider: row.key, region_key: regionKey, capability: "hail",
          ok: false, error: msg, duration_ms: Date.now() - startedAt,
        });
      }
    }

    /* ---- Upsert into hail_events (incremental sync) ---- */
    let upserted = 0;
    if (allEvents.length > 0) {
      const { data, error } = await supabase
        .from("hail_events")
        .upsert(allEvents, { onConflict: "source,external_id" })
        .select("id");
      if (error) throw error;
      upserted = data?.length ?? 0;
    }

    return new Response(JSON.stringify({
      ok: true,
      region: regionKey,
      duration_ms: Date.now() - t0,
      providers: providerStatus,
      events_received: allEvents.length,
      upserted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: (e as Error).message,
      duration_ms: Date.now() - t0,
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
