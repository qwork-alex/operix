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

/* ----- MeteoAlarm (EU severe alerts, no key) ----------------------------
 *  Real MeteoAlarm v1 JSON CAP shape:
 *    warnings[].alert.info[]  // one entry per language
 *      .parameter[]  -> { valueName:"awareness_type", value:"3; Thunderstorms" }
 *                       { valueName:"awareness_level", value:"3; orange; Severe" }
 *      .area[].geocode[] -> { valueName:"NUTS3", value:"FR522" }
 *      .severity / .certainty / .urgency / .onset / .expires / .event
 *  Filter: awareness_type=3 (thunderstorm, includes hail) AND level >= 2.
 *  Centroid: NUTS1 (first 3 chars) lookup table. Falls back to country centroid.
 *  Iterates ALL configured EU countries (does not depend on regionKey).
 * --------------------------------------------------------------------- */

// Country centroids (used as fallback when NUTS lookup misses)
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  FR: [46.5, 2.5], DE: [51.0, 10.5], IT: [42.5, 12.5], ES: [40.0, -3.7],
  CH: [46.8, 8.2], BE: [50.6, 4.6], NL: [52.2, 5.5], PT: [39.5, -8.0],
  AT: [47.6, 14.1], LU: [49.8, 6.1],
};

// NUTS1 (3-char prefix) centroids — covers the 10 supported EU countries.
// Source: Eurostat NUTS1 region centroids, rounded to 1 decimal.
const NUTS1_CENTROIDS: Record<string, [number, number]> = {
  // France
  FR1:[48.9,2.4], FRB:[47.8,1.7], FRC:[47.5,4.8], FRD:[49.4,0.4],
  FRE:[50.5,2.8], FRF:[48.6,7.3], FRG:[47.5,-1.0], FRH:[48.1,-3.0],
  FRI:[45.0,-0.5], FRJ:[43.8,3.5], FRK:[45.5,4.5], FRL:[44.0,6.0],
  FRM:[42.2,9.1], FRY:[-13.0,45.0],
  // Germany
  DE1:[48.5,9.0], DE2:[48.8,11.5], DE3:[52.5,13.4], DE4:[52.5,13.0],
  DE5:[53.1,8.8], DE6:[53.5,10.0], DE7:[50.7,9.0], DE8:[53.8,12.5],
  DE9:[52.8,9.7], DEA:[51.5,7.5], DEB:[49.9,7.5], DEC:[49.4,7.0],
  DED:[51.0,13.7], DEE:[51.9,11.6], DEF:[54.2,9.7], DEG:[51.0,11.0],
  // Italy
  ITC:[45.0,8.0], ITF:[40.8,15.5], ITG:[39.0,14.0], ITH:[46.0,11.5],
  ITI:[43.0,12.5],
  // Spain
  ES1:[43.0,-7.0], ES2:[42.5,-1.5], ES3:[40.4,-3.7], ES4:[40.0,-4.5],
  ES5:[39.0,-0.5], ES6:[37.0,-4.5], ES7:[28.3,-16.5],
  // Switzerland
  CH0:[46.8,8.2],
  // Belgium
  BE1:[50.85,4.35], BE2:[51.1,4.5], BE3:[50.4,4.9],
  // Netherlands
  NL1:[53.1,6.6], NL2:[52.3,6.0], NL3:[52.1,5.0], NL4:[51.5,5.0],
  // Portugal
  PT1:[39.5,-8.0], PT2:[38.7,-27.2], PT3:[32.7,-16.9],
  // Austria
  AT1:[48.2,16.4], AT2:[46.8,14.0], AT3:[47.8,13.7],
  // Luxembourg
  LU0:[49.8,6.1],
};

const COUNTRY_MAP: Record<string, string> = {
  FR:"france", DE:"germany", IT:"italy", ES:"spain", CH:"switzerland",
  BE:"belgium", NL:"netherlands", PT:"portugal", AT:"austria", LU:"luxembourg",
};

// Parse "3; orange; Severe" -> 3   |   "5; high-temperature" -> 5
function parseAwareness(raw: unknown): number {
  if (raw == null) return 0;
  const s = String(raw).trim();
  const m = s.match(/^(\d+)/);
  return m ? Number(m[1]) : 0;
}

function nutsToCoord(nutsCode: string, country: string): [number, number] {
  if (nutsCode && nutsCode.length >= 3) {
    const k3 = nutsCode.slice(0, 3).toUpperCase();
    if (NUTS1_CENTROIDS[k3]) return NUTS1_CENTROIDS[k3];
  }
  return COUNTRY_CENTROIDS[country] ?? [46.5, 2.5];
}

function severityFromLevel(level: number): Severity {
  if (level >= 4) return "extreme";
  if (level >= 3) return "severe";
  if (level >= 2) return "moderate";
  return "low";
}

async function fetchMeteoAlarmCountry(
  countryCode: string, cache: CacheStore,
): Promise<HailEvent[]> {
  const country = COUNTRY_MAP[countryCode] ?? countryCode.toLowerCase();
  const cacheKey = `mfalarm:${countryCode}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached as HailEvent[];

  const url = `https://feeds.meteoalarm.org/api/v1/warnings/feeds-${country}`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Lovable-OperationalMap (+nexus.qworkgroup.com)" },
  });
  if (!res.ok) throw new Error(`MeteoAlarm ${country} ${res.status}`);
  const json = await res.json().catch(() => ({}));

  const events: HailEvent[] = [];
  const warnings: any[] = json?.warnings ?? [];

  for (const w of warnings) {
    const alert = w?.alert ?? w;
    const identifier = alert?.identifier ?? w?.uuid ?? `ma-${countryCode}-${Date.now()}-${Math.random()}`;
    const infos: any[] = Array.isArray(alert?.info) ? alert.info : [];
    // Prefer English info block to keep payload normalised; fallback to first.
    const info =
      infos.find((i) => /^en/i.test(String(i?.language ?? ""))) ??
      infos[0];
    if (!info) continue;

    const params: any[] = Array.isArray(info.parameter) ? info.parameter : [];
    const typeParam = params.find((p) => p?.valueName === "awareness_type");
    const levelParam = params.find((p) => p?.valueName === "awareness_level");
    const awarenessType = parseAwareness(typeParam?.value);
    const awarenessLevel = parseAwareness(levelParam?.value);

    // Thunderstorm = 3 (covers hail). Keep level >= 2 (yellow+) for coverage.
    if (awarenessType !== 3 || awarenessLevel < 2) continue;

    const areas: any[] = Array.isArray(info.area) ? info.area : [];
    if (!areas.length) continue;

    const onset = info.onset ?? info.effective ?? alert?.sent ?? new Date().toISOString();
    const expires = info.expires ?? new Date(Date.now() + 6 * 3600_000).toISOString();
    const nowMs = Date.now();
    const isLive = new Date(onset).getTime() <= nowMs && new Date(expires).getTime() > nowMs;
    const status: Status = isLive ? "ongoing" : "forecast";
    const sev = severityFromLevel(awarenessLevel);

    // One event per area (gives finer geographic resolution).
    for (let idx = 0; idx < areas.length; idx++) {
      const area = areas[idx];
      const geocodes: any[] = Array.isArray(area?.geocode) ? area.geocode : [];
      const nutsEntry = geocodes.find((g) => /NUTS/i.test(String(g?.valueName ?? "")));
      const nutsCode = String(nutsEntry?.value ?? "");
      const [lat, lng] = nutsToCoord(nutsCode, countryCode);

      events.push({
        source: "meteofrance",
        external_id: `${identifier}::${nutsCode || idx}`,
        city: area?.areaDesc ?? null,
        region: nutsCode || countryCode,
        country: countryCode,
        lat, lng,
        radius_km: nutsCode ? 60 : 120,
        severity: sev,
        status,
        probability: awarenessLevel >= 4 ? 0.9 : awarenessLevel >= 3 ? 0.7 : 0.5,
        intensity: awarenessLevel * 25,
        forecast_time: status === "forecast" ? onset : null,
        observed_time: status === "ongoing" ? onset : null,
        expires_at: expires,
        metadata: {
          source_feed: "meteoalarm",
          country: countryCode,
          awareness_level: awarenessLevel,
          awareness_type: awarenessType,
          event: info.event,
          severity: info.severity,
          certainty: info.certainty,
          urgency: info.urgency,
          headline: info.headline,
          area_desc: area?.areaDesc,
          nuts: nutsCode || null,
        },
      });
    }
  }

  await cache.set({
    key: cacheKey, provider: "meteofrance", capability: "hail",
    regionKey: countryCode, payload: events, ttlSeconds: 600,
  });
  return events;
}

const MeteoFrance: WeatherProvider = {
  key: "meteofrance",
  capabilities: ["alerts", "hail", "severe"],
  async fetchHail(ctx) {
    // Iterate ALL supported EU countries on every run (engine passes only one
    // regionKey but Europe is single-tenant for this provider).
    const targets = Object.keys(COUNTRY_MAP);
    const all: HailEvent[] = [];
    for (const cc of targets) {
      try {
        const evs = await fetchMeteoAlarmCountry(cc, ctx.cache);
        all.push(...evs);
      } catch (e) {
        // Per-country failure must not break the whole run.
        console.warn(`[meteoalarm] ${cc} failed:`, (e as Error).message);
      }
    }
    return all;
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
      region: regionParam,
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
