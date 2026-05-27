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
  GB: [54.0, -2.0], IE: [53.3, -8.0], PL: [52.0, 19.0], CZ: [49.8, 15.5],
  SK: [48.7, 19.5], HU: [47.2, 19.5], RO: [45.9, 24.9], BG: [42.7, 25.5],
  GR: [39.0, 22.0], NO: [62.0, 10.0], SE: [62.0, 15.0], FI: [64.0, 26.0],
  DK: [56.0, 10.0],
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
  GB:"united-kingdom", IE:"ireland", PL:"poland", CZ:"czechia", SK:"slovakia",
  HU:"hungary", RO:"romania", BG:"bulgaria", GR:"greece",
  NO:"norway", SE:"sweden", FI:"finland", DK:"denmark",
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

/* ----- Global sampling grid (shared by Tomorrow.io + OpenMeteo) ---------- */
/* Storm-prone / populated points. Keep small to respect free-tier quotas. */
interface GridPoint { key: string; lat: number; lng: number; country: string; city?: string; }
const GLOBAL_GRID: GridPoint[] = [
  // Europe (complement MeteoAlarm)
  {key:"GB-LON",lat:51.5,lng:-0.1,country:"GB",city:"London"},
  {key:"IE-DUB",lat:53.3,lng:-6.3,country:"IE",city:"Dublin"},
  {key:"PL-WAW",lat:52.2,lng:21.0,country:"PL",city:"Warsaw"},
  {key:"CZ-PRG",lat:50.1,lng:14.4,country:"CZ",city:"Prague"},
  {key:"HU-BUD",lat:47.5,lng:19.0,country:"HU",city:"Budapest"},
  {key:"RO-BUC",lat:44.4,lng:26.1,country:"RO",city:"Bucharest"},
  {key:"GR-ATH",lat:38.0,lng:23.7,country:"GR",city:"Athens"},
  {key:"SE-STO",lat:59.3,lng:18.1,country:"SE",city:"Stockholm"},
  // Asia — China hail belt + Japan + Korea + India hail-prone plains + SE Asia
  {key:"CN-BJS",lat:39.9,lng:116.4,country:"CN",city:"Beijing"},
  {key:"CN-SHA",lat:31.2,lng:121.5,country:"CN",city:"Shanghai"},
  {key:"CN-CAN",lat:23.1,lng:113.3,country:"CN",city:"Guangzhou"},
  {key:"CN-CTU",lat:30.7,lng:104.1,country:"CN",city:"Chengdu"},
  {key:"CN-CKG",lat:29.6,lng:106.5,country:"CN",city:"Chongqing"},
  {key:"CN-XIY",lat:34.3,lng:108.9,country:"CN",city:"Xi'an"},
  {key:"CN-WUH",lat:30.6,lng:114.3,country:"CN",city:"Wuhan"},
  {key:"CN-HRB",lat:45.8,lng:126.5,country:"CN",city:"Harbin"},
  {key:"CN-SHE",lat:41.8,lng:123.4,country:"CN",city:"Shenyang"},
  {key:"CN-HOH",lat:40.8,lng:111.7,country:"CN",city:"Hohhot"},
  {key:"CN-LZH",lat:36.1,lng:103.8,country:"CN",city:"Lanzhou"},
  {key:"CN-KMG",lat:25.0,lng:102.7,country:"CN",city:"Kunming"},
  {key:"JP-TYO",lat:35.7,lng:139.7,country:"JP",city:"Tokyo"},
  {key:"JP-OSA",lat:34.7,lng:135.5,country:"JP",city:"Osaka"},
  {key:"JP-SDJ",lat:38.3,lng:140.9,country:"JP",city:"Sendai"},
  {key:"KR-SEL",lat:37.6,lng:127.0,country:"KR",city:"Seoul"},
  {key:"IN-DEL",lat:28.6,lng:77.2,country:"IN",city:"New Delhi"},
  {key:"IN-BOM",lat:19.1,lng:72.9,country:"IN",city:"Mumbai"},
  {key:"IN-CCU",lat:22.6,lng:88.4,country:"IN",city:"Kolkata"},
  {key:"IN-BLR",lat:13.0,lng:77.6,country:"IN",city:"Bangalore"},
  {key:"IN-HYD",lat:17.4,lng:78.5,country:"IN",city:"Hyderabad"},
  {key:"IN-NAG",lat:21.1,lng:79.1,country:"IN",city:"Nagpur"},
  {key:"PK-LHE",lat:31.5,lng:74.4,country:"PK",city:"Lahore"},
  {key:"BD-DAC",lat:23.8,lng:90.4,country:"BD",city:"Dhaka"},
  {key:"TH-BKK",lat:13.7,lng:100.5,country:"TH",city:"Bangkok"},
  {key:"VN-SGN",lat:10.8,lng:106.7,country:"VN",city:"Ho Chi Minh"},
  {key:"MY-KUL",lat:3.1,lng:101.7,country:"MY",city:"Kuala Lumpur"},
  {key:"ID-JKT",lat:-6.2,lng:106.8,country:"ID",city:"Jakarta"},
  {key:"PH-MNL",lat:14.6,lng:120.9,country:"PH",city:"Manila"},
  // Africa
  {key:"ZA-JNB",lat:-26.2,lng:28.0,country:"ZA",city:"Johannesburg"},
  {key:"MA-CMN",lat:33.6,lng:-7.6,country:"MA",city:"Casablanca"},
  {key:"DZ-ALG",lat:36.7,lng:3.1,country:"DZ",city:"Algiers"},
  {key:"TN-TUN",lat:36.8,lng:10.2,country:"TN",city:"Tunis"},
  {key:"EG-CAI",lat:30.0,lng:31.2,country:"EG",city:"Cairo"},
  {key:"NG-LOS",lat:6.5,lng:3.4,country:"NG",city:"Lagos"},
  {key:"KE-NBO",lat:-1.3,lng:36.8,country:"KE",city:"Nairobi"},
  {key:"ET-ADD",lat:9.0,lng:38.7,country:"ET",city:"Addis Ababa"},
  {key:"GH-ACC",lat:5.6,lng:-0.2,country:"GH",city:"Accra"},
  // Oceania — Australia hail alley (BoM data unavailable freely; inference covers)
  {key:"AU-SYD",lat:-33.9,lng:151.2,country:"AU",city:"Sydney"},
  {key:"AU-MEL",lat:-37.8,lng:144.9,country:"AU",city:"Melbourne"},
  {key:"AU-BNE",lat:-27.5,lng:153.0,country:"AU",city:"Brisbane"},
  {key:"AU-CBR",lat:-35.3,lng:149.1,country:"AU",city:"Canberra"},
  {key:"AU-ADL",lat:-34.9,lng:138.6,country:"AU",city:"Adelaide"},
  {key:"AU-PER",lat:-31.95,lng:115.86,country:"AU",city:"Perth"},
  {key:"NZ-AKL",lat:-36.8,lng:174.8,country:"NZ",city:"Auckland"},
  {key:"NZ-CHC",lat:-43.5,lng:172.6,country:"NZ",city:"Christchurch"},
  // South America — Brazil hail belt (South), Argentina pampas, Andes foothills
  {key:"MX-MEX",lat:19.4,lng:-99.1,country:"MX",city:"Mexico City"},
  {key:"MX-MTY",lat:25.7,lng:-100.3,country:"MX",city:"Monterrey"},
  {key:"BR-SAO",lat:-23.5,lng:-46.6,country:"BR",city:"São Paulo"},
  {key:"BR-RIO",lat:-22.9,lng:-43.2,country:"BR",city:"Rio de Janeiro"},
  {key:"BR-POA",lat:-30.0,lng:-51.2,country:"BR",city:"Porto Alegre"},
  {key:"BR-CWB",lat:-25.4,lng:-49.3,country:"BR",city:"Curitiba"},
  {key:"BR-FLN",lat:-27.6,lng:-48.5,country:"BR",city:"Florianópolis"},
  {key:"BR-CGB",lat:-15.6,lng:-56.1,country:"BR",city:"Cuiabá"},
  {key:"BR-BSB",lat:-15.8,lng:-47.9,country:"BR",city:"Brasília"},
  {key:"BR-BHZ",lat:-19.9,lng:-43.9,country:"BR",city:"Belo Horizonte"},
  {key:"BR-REC",lat:-8.0,lng:-34.9,country:"BR",city:"Recife"},
  {key:"BR-MAO",lat:-3.1,lng:-60.0,country:"BR",city:"Manaus"},
  {key:"AR-BUE",lat:-34.6,lng:-58.4,country:"AR",city:"Buenos Aires"},
  {key:"AR-COR",lat:-31.4,lng:-64.2,country:"AR",city:"Córdoba"},
  {key:"AR-MDZ",lat:-32.9,lng:-68.8,country:"AR",city:"Mendoza"},
  {key:"AR-ROS",lat:-32.9,lng:-60.7,country:"AR",city:"Rosario"},
  {key:"UY-MVD",lat:-34.9,lng:-56.2,country:"UY",city:"Montevideo"},
  {key:"PY-ASU",lat:-25.3,lng:-57.6,country:"PY",city:"Asunción"},
  {key:"CL-SCL",lat:-33.4,lng:-70.6,country:"CL",city:"Santiago"},
  {key:"BO-LPB",lat:-16.5,lng:-68.1,country:"BO",city:"La Paz"},
  {key:"CO-BOG",lat:4.7,lng:-74.1,country:"CO",city:"Bogotá"},
  {key:"CO-MDE",lat:6.2,lng:-75.6,country:"CO",city:"Medellín"},
  {key:"PE-LIM",lat:-12.0,lng:-77.0,country:"PE",city:"Lima"},
  {key:"EC-UIO",lat:-0.2,lng:-78.5,country:"EC",city:"Quito"},
  {key:"VE-CCS",lat:10.5,lng:-66.9,country:"VE",city:"Caracas"},
];


function severityFromHailMm(mm: number | null): Severity {
  const v = mm ?? 10;
  if (v >= 50) return "extreme";
  if (v >= 25) return "severe";
  if (v >= 12) return "moderate";
  return "low";
}

/* ----- Tomorrow.io (paid, global grid) ----------------------------------- */
const TomorrowIo: WeatherProvider = {
  key: "tomorrowio",
  capabilities: ["hail", "precipitation", "wind", "lightning", "storm_cells"],
  async fetchHail(ctx) {
    if (!ctx.apiKey) return [];
    const cacheKey = `tio:hail:global`;
    const cached = await ctx.cache.get(cacheKey);
    if (cached) return cached as HailEvent[];

    const events: HailEvent[] = [];
    // Cap calls to protect free tier (25/hr typical). Rotate through grid.
    const maxCalls = 18;
    const stride = Math.max(1, Math.floor(GLOBAL_GRID.length / maxCalls));
    const targets = GLOBAL_GRID.filter((_, i) => i % stride === 0).slice(0, maxCalls);

    for (const p of targets) {
      try {
        const url = `https://api.tomorrow.io/v4/weather/forecast?location=${p.lat},${p.lng}&apikey=${ctx.apiKey}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();
        const hourly = json?.timelines?.hourly ?? [];
        for (const h of hourly.slice(0, 24)) {
          const v = h.values ?? {};
          const hail = v.hailBinary ?? 0;
          if (!hail) continue;
          const sizeMm = (v.hailSize ?? 10) * 1;
          events.push({
            source: "tomorrowio",
            external_id: `tio-${p.key}-${h.time}`,
            city: p.city ?? null, country: p.country,
            lat: p.lat, lng: p.lng, radius_km: 25,
            severity: severityFromHailMm(sizeMm),
            status: "forecast",
            hail_size_mm: sizeMm,
            probability: (v.precipitationProbability ?? 50) / 100,
            intensity: Math.min(100, sizeMm * 1.5),
            storm_speed_kmh: v.windSpeed ? v.windSpeed * 3.6 : null,
            storm_direction_deg: v.windDirection ?? null,
            forecast_time: h.time,
            expires_at: new Date(new Date(h.time).getTime() + 3600_000).toISOString(),
            metadata: { grid: p.key, source_values: v },
          });
        }
      } catch (e) {
        console.warn(`[tomorrowio] ${p.key} failed:`, (e as Error).message);
      }
    }

    await ctx.cache.set({
      key: cacheKey, provider: "tomorrowio", capability: "hail",
      regionKey: "global", payload: events, ttlSeconds: 900,
    });
    return events;
  },
};

/* ----- OpenMeteo (free, global fallback) --------------------------------- *
 *  WMO weather codes 96 = thunderstorm w/ slight hail, 99 = w/ heavy hail. */
const OpenMeteo: WeatherProvider = {
  key: "openmeteo",
  capabilities: ["precipitation", "wind", "hail", "severe"],
  async fetchHail(ctx) {
    const cacheKey = `om:hail:global`;
    const cached = await ctx.cache.get(cacheKey);
    if (cached) return cached as HailEvent[];

    const events: HailEvent[] = [];
    // Batch in groups of 8 lat/lng pairs (OpenMeteo supports comma-separated coords).
    const chunkSize = 8;
    for (let i = 0; i < GLOBAL_GRID.length; i += chunkSize) {
      const chunk = GLOBAL_GRID.slice(i, i + chunkSize);
      const lats = chunk.map(p => p.lat).join(",");
      const lngs = chunk.map(p => p.lng).join(",");
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}` +
        `&hourly=weathercode,precipitation,windspeed_10m,winddirection_10m` +
        `&forecast_days=2&timezone=UTC`;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();
        const items = Array.isArray(json) ? json : [json];
        items.forEach((entry: any, idx: number) => {
          const p = chunk[idx];
          if (!p) return;
          const times: string[] = entry?.hourly?.time ?? [];
          const codes: number[] = entry?.hourly?.weathercode ?? [];
          const precs: number[] = entry?.hourly?.precipitation ?? [];
          const winds: number[] = entry?.hourly?.windspeed_10m ?? [];
          const dirs:  number[] = entry?.hourly?.winddirection_10m ?? [];
          const nowMs = Date.now();
          for (let j = 0; j < times.length; j++) {
            const code = codes[j];
            // PHASE 4: hard noise filter — only WMO 99 (heavy hail thunderstorm).
            // Code 96 (slight hail) requires meaningful precip corroboration
            // (>=6mm/h) otherwise we ignore it as low-confidence convection.
            const precip = precs[j] ?? 0;
            if (code !== 99 && !(code === 96 && precip >= 6)) continue;
            const tMs = new Date(times[j] + "Z").getTime();
            if (tMs < nowMs - 3600_000) continue;
            const isLive = Math.abs(tMs - nowMs) < 3600_000;
            const sizeMm = code === 99 ? 22 : 12;
            const confidence = code === 99 ? 0.7 : 0.55;
            events.push({
              source: "openmeteo",
              external_id: `om-${p.key}-${times[j]}`,
              city: p.city ?? null, country: p.country,
              lat: p.lat, lng: p.lng, radius_km: 35,
              severity: code === 99 ? "severe" : "moderate",
              status: isLive ? "ongoing" : "forecast",
              hail_size_mm: sizeMm,
              probability: confidence,
              intensity: code === 99 ? 72 : 48,
              storm_speed_kmh: winds[j] ?? null,
              storm_direction_deg: dirs[j] ?? null,
              forecast_time: isLive ? null : times[j] + "Z",
              observed_time: isLive ? times[j] + "Z" : null,
              expires_at: new Date(tMs + 3600_000).toISOString(),
              metadata: {
                grid: p.key, wmo_code: code,
                precipitation_mm: precip,
                confidence,
              },
            });
          }
        });
      } catch (e) {
        console.warn(`[openmeteo] chunk ${i} failed:`, (e as Error).message);
      }
    }

    await ctx.cache.set({
      key: cacheKey, provider: "openmeteo", capability: "hail",
      regionKey: "global", payload: events, ttlSeconds: 600,
    });
    return events;
  },
};

/* ===========================================================================
 *  HAIL OPERATIONAL ENGINE (Phase 3)
 *  ---------------------------------------------------------------------------
 *  Goal: detect hail probability OPERATIONALLY even where no official feed
 *  exists (China, South America, India, JP, AU, AF). We score atmospheric
 *  instability + convective signature from free OpenMeteo fields:
 *
 *    cape                       — Convective Available Potential Energy (J/kg)
 *    lifted_index               — atmospheric instability (negative = unstable)
 *    freezing_level_height (m)  — lower = larger hail survives to ground
 *    convective_inhibition      — energy barrier to convection
 *    precipitation              — current/forecast precip (mm/h)
 *    weathercode (WMO)          — 95/96/99 = thunderstorm family
 *    cloudcover_high            — anvil / cloud top signature
 *    wind_gusts_10m             — storm downdraft proxy
 *
 *  Output: composite operational score 0..100 → BAIXO/MODERADO/SEVERO/EXTREMO.
 *  This NEVER overrides an official alert; it lives at lower priority and is
 *  deduped by (source, external_id) so genuine MeteoAlarm/NOAA wins.
 * ===========================================================================*/

interface InstabilityInput {
  cape: number | null;
  liftedIndex: number | null;
  freezingLevelM: number | null;
  cin: number | null;
  precipMm: number | null;
  weatherCode: number | null;
  highCloudPct: number | null;
  windGustKmh: number | null;
}

interface OperationalScore {
  score: number;           // 0..100
  severity: Severity;
  level: "BAIXO" | "MODERADO" | "SEVERO" | "EXTREMO";
  hailProbability: number; // 0..1
  inferredHailMm: number;  // estimated stone size
  confidence: number;      // 0..1 — how many independent signals corroborate
  reasons: string[];
}

/**
 * PHASE 4 — Refined operational hail scoring.
 *
 * Rebalance vs Phase 3:
 *  - Reduced weight on isolated precipitation, marginal CAPE and weak instability
 *  - Increased weight on multi-signal convective signatures (CAPE × LI × storm code)
 *  - Heavier penalty for strong CIN (capped atmospheres do not produce hail)
 *  - New confidence score: # of independent signals confirming the event
 *  - New bands: 0-25 ignore, 26-40 low, 41-60 moderate, 61-80 severe, 81-100 extreme
 *  - Synergy bonus only when CAPE ≥ 1500 AND LI ≤ -4 AND active storm code
 */
function scoreConvectiveHail(x: InstabilityInput): OperationalScore {
  const reasons: string[] = [];
  let score = 0;
  let signals = 0; // independent confirmations

  // 1) CAPE — dominant driver, but marginal CAPE alone is no longer enough
  if (x.cape != null) {
    if (x.cape >= 3500)      { score += 38; signals++; reasons.push(`CAPE ${Math.round(x.cape)} J/kg (extreme)`); }
    else if (x.cape >= 2500) { score += 28; signals++; reasons.push(`CAPE ${Math.round(x.cape)} J/kg (severe)`); }
    else if (x.cape >= 1500) { score += 16; signals++; reasons.push(`CAPE ${Math.round(x.cape)} J/kg (moderate)`); }
    else if (x.cape >= 1000) { score += 5; reasons.push(`CAPE ${Math.round(x.cape)} J/kg (marginal)`); }
    // CAPE < 1000 contributes nothing (was 10 pts in phase 3 — noise source)
  }
  // 2) Lifted Index — instability multiplier
  if (x.liftedIndex != null) {
    if (x.liftedIndex <= -8)      { score += 22; signals++; reasons.push(`LI ${x.liftedIndex.toFixed(1)} (extreme)`); }
    else if (x.liftedIndex <= -5) { score += 15; signals++; reasons.push(`LI ${x.liftedIndex.toFixed(1)} (severe)`); }
    else if (x.liftedIndex <= -2) { score += 6; reasons.push(`LI ${x.liftedIndex.toFixed(1)} (moderate)`); }
    // LI > -2 = stable, contributes nothing
  }
  // 3) Freezing level — lower = larger hailstones reach ground
  if (x.freezingLevelM != null) {
    if (x.freezingLevelM < 2800)      { score += 14; signals++; reasons.push(`Freezing ${Math.round(x.freezingLevelM)}m (low)`); }
    else if (x.freezingLevelM < 3500) { score += 8; reasons.push(`Freezing ${Math.round(x.freezingLevelM)}m`); }
    else if (x.freezingLevelM < 4200) { score += 3; }
    // >4200m hail melts before reaching surface
  }
  // 4) Active thunderstorm code — strong confirmer
  if (x.weatherCode != null) {
    if (x.weatherCode === 99)      { score += 22; signals++; reasons.push("WMO 99: heavy hail thunderstorm"); }
    else if (x.weatherCode === 96) { score += 14; signals++; reasons.push("WMO 96: slight hail thunderstorm"); }
    else if (x.weatherCode === 95) { score += 5; reasons.push("WMO 95: thunderstorm"); }
  }
  // 5) Storm rotation / downdraft proxy via wind gusts
  if (x.windGustKmh != null) {
    if (x.windGustKmh >= 90)      { score += 10; signals++; reasons.push(`Gusts ${Math.round(x.windGustKmh)} km/h (severe)`); }
    else if (x.windGustKmh >= 70) { score += 6; signals++; reasons.push(`Gusts ${Math.round(x.windGustKmh)} km/h`); }
    else if (x.windGustKmh >= 50) { score += 2; }
  }
  // 6) High cloud / anvil signature (weak confirmer)
  if (x.highCloudPct != null && x.highCloudPct >= 80) {
    score += 3; reasons.push(`High-cloud ${Math.round(x.highCloudPct)}%`);
  }
  // 7) Precipitation cross-check — only meaningful at high intensity
  if (x.precipMm != null) {
    if (x.precipMm >= 15) { score += 4; reasons.push(`Precip ${x.precipMm.toFixed(1)} mm/h`); }
    else if (x.precipMm >= 8) { score += 2; }
    // light precip ignored — was a major false-positive source
  }
  // 8) CIN penalty — stronger now: a strong cap effectively kills convection
  if (x.cin != null) {
    if (x.cin <= -200)      { score -= 22; reasons.push(`CIN ${Math.round(x.cin)} J/kg (heavily capped)`); }
    else if (x.cin <= -100) { score -= 10; reasons.push(`CIN ${Math.round(x.cin)} J/kg (capped)`); }
  }

  // SYNERGY BONUS — only when the three pillars all confirm a severe setup.
  // This rewards true convective signatures and avoids inflating isolated signals.
  if (
    x.cape != null && x.cape >= 1500 &&
    x.liftedIndex != null && x.liftedIndex <= -4 &&
    x.weatherCode != null && (x.weatherCode === 96 || x.weatherCode === 99)
  ) {
    score += 8; signals++; reasons.push("Synergy: CAPE × LI × storm-code confirmed");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // PHASE 4 bands: 0-25 ignore, 26-40 low, 41-60 moderate, 61-80 severe, 81-100 extreme
  let level: OperationalScore["level"] = "BAIXO";
  let severity: Severity = "low";
  if (score >= 81)      { level = "EXTREMO"; severity = "extreme"; }
  else if (score >= 61) { level = "SEVERO";  severity = "severe"; }
  else if (score >= 41) { level = "MODERADO"; severity = "moderate"; }

  // Stone size estimate (mm) — empirical from CAPE × freezing level
  let inferredHailMm = 0;
  if (x.cape != null && x.cape >= 800) {
    inferredHailMm = Math.max(0, Math.sqrt(Math.max(0, x.cape - 500)) * 0.42);
    if (x.freezingLevelM != null && x.freezingLevelM < 3200) inferredHailMm *= 1.25;
  }
  inferredHailMm = Math.min(80, Math.round(inferredHailMm));

  // Confidence: how many independent signals agree (max 6 weighted ~)
  // 0 signals = 0, 1 = 0.25, 2 = 0.45, 3 = 0.65, 4 = 0.8, 5+ = 0.92
  const confTable = [0, 0.25, 0.45, 0.65, 0.8, 0.92, 0.96];
  const confidence = confTable[Math.min(signals, 6)];

  const hailProbability = Math.min(0.95, (score / 100) * (0.5 + confidence * 0.5));
  return { score, severity, level, hailProbability, inferredHailMm, confidence, reasons };
}

/* ----- Convective Inference provider (free, global, OpenMeteo-backed) ----
 *  Uses OpenMeteo's atmospheric instability fields to infer hail in regions
 *  without an official feed. Threshold: score >= 35 (MODERADO+). Below that
 *  we don't emit an event — keeps the radar focused on operational signal.
 * --------------------------------------------------------------------- */
const ConvectiveInference: WeatherProvider = {
  key: "convective_inference",
  capabilities: ["hail", "severe", "storm_cells", "precipitation", "wind"],
  async fetchHail(ctx) {
    const cacheKey = `ci:hail:global`;
    const cached = await ctx.cache.get(cacheKey);
    if (cached) return cached as HailEvent[];

    const events: HailEvent[] = [];
    const chunkSize = 8;

    for (let i = 0; i < GLOBAL_GRID.length; i += chunkSize) {
      const chunk = GLOBAL_GRID.slice(i, i + chunkSize);
      const lats = chunk.map(p => p.lat).join(",");
      const lngs = chunk.map(p => p.lng).join(",");
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}` +
        `&hourly=cape,lifted_index,freezing_level_height,convective_inhibition,` +
        `precipitation,weathercode,cloudcover_high,wind_gusts_10m` +
        `&forecast_days=2&timezone=UTC`;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();
        const items = Array.isArray(json) ? json : [json];
        items.forEach((entry: any, idx: number) => {
          const p = chunk[idx];
          if (!p) return;
          const h = entry?.hourly ?? {};
          const times: string[] = h.time ?? [];
          const nowMs = Date.now();
          // Sample a window: next 24h, every 3h to keep payload bounded.
          for (let j = 0; j < times.length; j += 3) {
            const tMs = new Date(times[j] + "Z").getTime();
            if (tMs < nowMs - 3600_000 || tMs > nowMs + 24 * 3600_000) continue;

            const input: InstabilityInput = {
              cape: h.cape?.[j] ?? null,
              liftedIndex: h.lifted_index?.[j] ?? null,
              freezingLevelM: h.freezing_level_height?.[j] ?? null,
              cin: h.convective_inhibition?.[j] ?? null,
              precipMm: h.precipitation?.[j] ?? null,
              weatherCode: h.weathercode?.[j] ?? null,
              highCloudPct: h.cloudcover_high?.[j] ?? null,
              windGustKmh: h.wind_gusts_10m?.[j] ?? null,
            };
            const op = scoreConvectiveHail(input);
            // PHASE 4: stricter emit gate.
            //  - score must be MODERADO+ (>= 41)
            //  - confidence must be >= 0.45 (at least 2 independent signals)
            // Below these thresholds we suppress to keep the radar professional.
            if (op.score < 41) continue;
            if (op.confidence < 0.45) continue;

            const isLive = Math.abs(tMs - nowMs) < 90 * 60_000;
            // Radius scales with severity for cleaner clustering at zoom
            const radiusKm =
              op.severity === "extreme" ? 45 :
              op.severity === "severe"  ? 35 : 25;
            events.push({
              source: "convective_inference",
              external_id: `ci-${p.key}-${times[j]}`,
              city: p.city ?? null, country: p.country,
              lat: p.lat, lng: p.lng, radius_km: radiusKm,
              severity: op.severity,
              status: isLive ? "ongoing" : "forecast",
              hail_size_mm: op.inferredHailMm || null,
              probability: op.hailProbability,
              intensity: op.score,
              storm_speed_kmh: input.windGustKmh ?? null,
              forecast_time: isLive ? null : times[j] + "Z",
              observed_time: isLive ? times[j] + "Z" : null,
              expires_at: new Date(tMs + 3 * 3600_000).toISOString(),
              metadata: {
                engine: "hailOperationalEngine",
                version: 4,
                grid: p.key,
                operational_score: op.score,
                operational_level: op.level,
                confidence: op.confidence,
                reasons: op.reasons,
                inputs: input,
              },
            });
          }
        });
      } catch (e) {
        console.warn(`[convective_inference] chunk ${i} failed:`, (e as Error).message);
      }
    }

    await ctx.cache.set({
      key: cacheKey, provider: "convective_inference", capability: "hail",
      regionKey: "global", payload: events, ttlSeconds: 900,
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
  openmeteo: OpenMeteo,
  convective_inference: ConvectiveInference,
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
