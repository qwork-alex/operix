import { PrismaClient } from "@prisma/client";

/* ---------------------------------------------------------------- types --- */
type Capability = "hail" | "radar" | "precipitation" | "lightning" | "wind" | "alerts" | "severe" | "storm_cells";
type Severity = "low" | "moderate" | "severe" | "extreme";
type Status = "forecast" | "ongoing" | "confirmed" | "closed";

interface HailEvent {
  source: string; external_id: string; city?: string | null; region?: string | null;
  country?: string | null; lat: number; lng: number; radius_km?: number;
  severity: Severity; status: Status; hail_size_mm?: number | null;
  probability?: number | null; intensity?: number | null;
  storm_speed_kmh?: number | null; storm_direction_deg?: number | null;
  forecast_time?: string | null; observed_time?: string | null;
  expires_at?: string | null; metadata?: Record<string, unknown>;
}

interface FetchContext { apiKey?: string; regionKey: string; cache: CacheStore; }
interface WeatherProvider { key: string; capabilities: Capability[]; fetchHail?(ctx: FetchContext): Promise<HailEvent[]>; }

/* -------------------------------------------------------- in-memory cache --- */
class CacheStore {
  private store = new Map<string, { payload: unknown; expiresAt: number }>();
  get(key: string): unknown | null {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.payload;
  }
  set(args: { key: string; payload: unknown; ttlSeconds: number }) {
    this.store.set(args.key, { payload: args.payload, expiresAt: Date.now() + args.ttlSeconds * 1000 });
  }
}

const globalCache = new CacheStore();

/* ---- NUTS1 / country centroid lookup tables (copied from edge fn) ---- */
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  FR:[46.5,2.5],DE:[51.0,10.5],IT:[42.5,12.5],ES:[40.0,-3.7],CH:[46.8,8.2],
  BE:[50.6,4.6],NL:[52.2,5.5],PT:[39.5,-8.0],AT:[47.6,14.1],LU:[49.8,6.1],
  GB:[54.0,-2.0],IE:[53.3,-8.0],PL:[52.0,19.0],CZ:[49.8,15.5],SK:[48.7,19.5],
  HU:[47.2,19.5],RO:[45.9,24.9],BG:[42.7,25.5],GR:[39.0,22.0],NO:[62.0,10.0],
  SE:[62.0,15.0],FI:[64.0,26.0],DK:[56.0,10.0],
};
const NUTS1_CENTROIDS: Record<string,[number,number]> = {
  FR1:[48.9,2.4],FRB:[47.8,1.7],FRC:[47.5,4.8],FRD:[49.4,0.4],FRE:[50.5,2.8],
  FRF:[48.6,7.3],FRG:[47.5,-1.0],FRH:[48.1,-3.0],FRI:[45.0,-0.5],FRJ:[43.8,3.5],
  FRK:[45.5,4.5],FRL:[44.0,6.0],FRM:[42.2,9.1],
  DE1:[48.5,9.0],DE2:[48.8,11.5],DE3:[52.5,13.4],DE4:[52.5,13.0],DE5:[53.1,8.8],
  DE6:[53.5,10.0],DE7:[50.7,9.0],DE8:[53.8,12.5],DE9:[52.8,9.7],DEA:[51.5,7.5],
  DEB:[49.9,7.5],DEC:[49.4,7.0],DED:[51.0,13.7],DEE:[51.9,11.6],DEF:[54.2,9.7],
  DEG:[51.0,11.0],ITC:[45.0,8.0],ITF:[40.8,15.5],ITG:[39.0,14.0],ITH:[46.0,11.5],
  ITI:[43.0,12.5],ES1:[43.0,-7.0],ES2:[42.5,-1.5],ES3:[40.4,-3.7],ES4:[40.0,-4.5],
  ES5:[39.0,-0.5],ES6:[37.0,-4.5],CH0:[46.8,8.2],
  BE1:[50.85,4.35],BE2:[51.1,4.5],BE3:[50.4,4.9],
  NL1:[53.1,6.6],NL2:[52.3,6.0],NL3:[52.1,5.0],NL4:[51.5,5.0],
  PT1:[39.5,-8.0],AT1:[48.2,16.4],AT2:[46.8,14.0],AT3:[47.8,13.7],LU0:[49.8,6.1],
};
const COUNTRY_MAP: Record<string,string> = {
  FR:"france",DE:"germany",IT:"italy",ES:"spain",CH:"switzerland",
  BE:"belgium",NL:"netherlands",PT:"portugal",AT:"austria",LU:"luxembourg",
  GB:"united-kingdom",IE:"ireland",PL:"poland",CZ:"czechia",SK:"slovakia",
  HU:"hungary",RO:"romania",BG:"bulgaria",GR:"greece",NO:"norway",SE:"sweden",FI:"finland",DK:"denmark",
};

function parseAwareness(raw: unknown): number {
  const s = String(raw ?? "").trim(); const m = s.match(/^(\d+)/); return m ? Number(m[1]) : 0;
}
function nutsToCoord(nutsCode: string, country: string): [number,number] {
  if (nutsCode && nutsCode.length >= 3) { const k3 = nutsCode.slice(0,3).toUpperCase(); if (NUTS1_CENTROIDS[k3]) return NUTS1_CENTROIDS[k3]; }
  return COUNTRY_CENTROIDS[country] ?? [46.5,2.5];
}
function severityFromLevel(level: number): Severity {
  if (level >= 4) return "extreme"; if (level >= 3) return "severe"; if (level >= 2) return "moderate"; return "low";
}

async function fetchMeteoAlarmCountry(countryCode: string, cache: CacheStore): Promise<HailEvent[]> {
  const country = COUNTRY_MAP[countryCode] ?? countryCode.toLowerCase();
  const cacheKey = `mfalarm:${countryCode}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached as HailEvent[];

  const url = `https://feeds.meteoalarm.org/api/v1/warnings/feeds-${country}`;
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "QW-Nexus-Operational" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`MeteoAlarm ${country} ${res.status}`);
  const json = await res.json().catch(() => ({}));
  const events: HailEvent[] = [];
  for (const w of (json?.warnings ?? []) as any[]) {
    const alert = w?.alert ?? w;
    const identifier = alert?.identifier ?? w?.uuid ?? `ma-${countryCode}-${Date.now()}-${Math.random()}`;
    const infos: any[] = Array.isArray(alert?.info) ? alert.info : [];
    const info = infos.find((i: any) => /^en/i.test(String(i?.language ?? ""))) ?? infos[0];
    if (!info) continue;
    const params: any[] = Array.isArray(info.parameter) ? info.parameter : [];
    const typeParam = params.find((p: any) => p?.valueName === "awareness_type");
    const levelParam = params.find((p: any) => p?.valueName === "awareness_level");
    const awarenessType = parseAwareness(typeParam?.value);
    const awarenessLevel = parseAwareness(levelParam?.value);
    if (awarenessType !== 3 || awarenessLevel < 2) continue;
    const areas: any[] = Array.isArray(info.area) ? info.area : [];
    if (!areas.length) continue;
    const onset = info.onset ?? info.effective ?? alert?.sent ?? new Date().toISOString();
    const expires = info.expires ?? new Date(Date.now() + 6 * 3600_000).toISOString();
    const isLive = new Date(onset).getTime() <= Date.now() && new Date(expires).getTime() > Date.now();
    const status: Status = isLive ? "ongoing" : "forecast";
    for (let idx = 0; idx < areas.length; idx++) {
      const area = areas[idx];
      const geocodes: any[] = Array.isArray(area?.geocode) ? area.geocode : [];
      const nutsEntry = geocodes.find((g: any) => /NUTS/i.test(String(g?.valueName ?? "")));
      const nutsCode = String(nutsEntry?.value ?? "");
      const [lat, lng] = nutsToCoord(nutsCode, countryCode);
      events.push({
        source: "meteofrance", external_id: `${identifier}::${nutsCode || idx}`,
        city: area?.areaDesc ?? null, region: nutsCode || countryCode, country: countryCode,
        lat, lng, radius_km: nutsCode ? 60 : 120, severity: severityFromLevel(awarenessLevel), status,
        probability: awarenessLevel >= 4 ? 0.9 : awarenessLevel >= 3 ? 0.7 : 0.5,
        intensity: awarenessLevel * 25, forecast_time: status === "forecast" ? onset : null,
        observed_time: status === "ongoing" ? onset : null, expires_at: expires,
        metadata: { source_feed: "meteoalarm", country: countryCode, awareness_level: awarenessLevel, awareness_type: awarenessType },
      });
    }
  }
  cache.set({ key: cacheKey, payload: events, ttlSeconds: 600 });
  return events;
}

const MeteoFrance: WeatherProvider = {
  key: "meteofrance", capabilities: ["alerts","hail","severe"],
  async fetchHail(ctx) {
    const all: HailEvent[] = [];
    for (const cc of Object.keys(COUNTRY_MAP)) {
      try { all.push(...await fetchMeteoAlarmCountry(cc, ctx.cache)); }
      catch (e) { console.warn(`[meteoalarm] ${cc} failed:`, (e as Error).message); }
    }
    return all;
  },
};

const NOAA: WeatherProvider = {
  key: "noaa", capabilities: ["alerts","hail","severe","storm_cells"],
  async fetchHail(ctx) {
    const cacheKey = `noaa:hail:${ctx.regionKey}`;
    const cached = ctx.cache.get(cacheKey); if (cached) return cached as HailEvent[];
    const url = "https://api.weather.gov/alerts/active?event=Severe%20Thunderstorm%20Warning";
    const res = await fetch(url, { headers: { accept: "application/geo+json", "user-agent": "QW-Nexus-Operational" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`NOAA alerts ${res.status}`);
    const json = await res.json();
    const events: HailEvent[] = [];
    for (const f of (json?.features ?? []) as any[]) {
      const props = f.properties ?? {}; const params = props.parameters ?? {};
      const sizeRaw = (params.maxHailSize ?? params.hailSize ?? [])[0];
      const sizeIn = parseFloat(String(sizeRaw ?? "0")) || 0;
      const sizeMm = sizeIn ? sizeIn * 25.4 : null;
      const sev: Severity = sizeMm == null ? "moderate" : sizeMm >= 50 ? "extreme" : sizeMm >= 25 ? "severe" : sizeMm >= 12 ? "moderate" : "low";
      let lat = 0, lng = 0, n = 0;
      const geom = f.geometry;
      if (geom?.type === "Polygon") { for (const ring of geom.coordinates) for (const [x, y] of ring) { lng += x; lat += y; n++; } }
      if (!n) continue; lng /= n; lat /= n;
      events.push({
        source: "noaa", external_id: props.id ?? f.id,
        city: props.areaDesc?.split(";")[0]?.trim() ?? null, region: null, country: "US",
        lat, lng, radius_km: 30, severity: sev, status: "ongoing",
        hail_size_mm: sizeMm, probability: 0.9,
        intensity: Math.min(100, (sizeMm ?? 10) * 1.5),
        forecast_time: props.sent ?? null, observed_time: props.effective ?? null,
        expires_at: props.expires ?? null, metadata: { headline: props.headline, severity: props.severity },
      });
    }
    ctx.cache.set({ key: cacheKey, payload: events, ttlSeconds: 300 });
    return events;
  },
};

/* Global sampling grid (subset from edge fn) */
interface GridPoint { key: string; lat: number; lng: number; country: string; city?: string; }
const GLOBAL_GRID: GridPoint[] = [
  {key:"FR-PAR",lat:48.86,lng:2.35,country:"FR",city:"Paris"},{key:"FR-LYO",lat:45.76,lng:4.84,country:"FR",city:"Lyon"},
  {key:"FR-MAR",lat:43.30,lng:5.37,country:"FR",city:"Marseille"},{key:"FR-TOU",lat:43.60,lng:1.44,country:"FR",city:"Toulouse"},
  {key:"FR-BDX",lat:44.84,lng:-0.58,country:"FR",city:"Bordeaux"},{key:"FR-NAN",lat:47.22,lng:-1.55,country:"FR",city:"Nantes"},
  {key:"FR-STR",lat:48.57,lng:7.75,country:"FR",city:"Strasbourg"},{key:"GB-LON",lat:51.5,lng:-0.1,country:"GB",city:"London"},
  {key:"DE-BER",lat:52.52,lng:13.40,country:"DE",city:"Berlin"},{key:"DE-MUN",lat:48.13,lng:11.58,country:"DE",city:"Munich"},
  {key:"IT-MIL",lat:45.46,lng:9.19,country:"IT",city:"Milan"},{key:"ES-MAD",lat:40.42,lng:-3.70,country:"ES",city:"Madrid"},
  {key:"PL-WAW",lat:52.2,lng:21.0,country:"PL",city:"Warsaw"},{key:"RO-BUC",lat:44.4,lng:26.1,country:"RO",city:"Bucharest"},
  {key:"BR-SAO",lat:-23.5,lng:-46.6,country:"BR",city:"São Paulo"},{key:"BR-RIO",lat:-22.9,lng:-43.2,country:"BR",city:"Rio de Janeiro"},
  {key:"AR-BUE",lat:-34.6,lng:-58.4,country:"AR",city:"Buenos Aires"},{key:"US-CHI",lat:41.85,lng:-87.65,country:"US",city:"Chicago"},
  {key:"US-HOU",lat:29.76,lng:-95.37,country:"US",city:"Houston"},{key:"US-DAL",lat:32.78,lng:-96.80,country:"US",city:"Dallas"},
  {key:"AU-SYD",lat:-33.9,lng:151.2,country:"AU",city:"Sydney"},{key:"AU-MEL",lat:-37.8,lng:144.9,country:"AU",city:"Melbourne"},
  {key:"IN-DEL",lat:28.6,lng:77.2,country:"IN",city:"New Delhi"},{key:"ZA-JNB",lat:-26.2,lng:28.0,country:"ZA",city:"Johannesburg"},
];

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
  return 2*6371*Math.asin(Math.min(1,Math.sqrt(h)));
}

function severityFromHailMm(mm: number | null): Severity {
  const v = mm ?? 10;
  return v >= 50 ? "extreme" : v >= 25 ? "severe" : v >= 12 ? "moderate" : "low";
}

const OpenMeteo: WeatherProvider = {
  key: "openmeteo", capabilities: ["precipitation","wind","hail","severe"],
  async fetchHail(ctx) {
    const cacheKey = `om:hail:global`;
    const cached = ctx.cache.get(cacheKey); if (cached) return cached as HailEvent[];
    const events: HailEvent[] = [];
    const chunkSize = 8;
    for (let i = 0; i < GLOBAL_GRID.length; i += chunkSize) {
      const chunk = GLOBAL_GRID.slice(i, i + chunkSize);
      const lats = chunk.map(p => p.lat).join(","), lngs = chunk.map(p => p.lng).join(",");
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&hourly=weathercode,precipitation,windspeed_10m,winddirection_10m&forecast_days=2&timezone=UTC`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) continue;
        const json = await res.json();
        const items = Array.isArray(json) ? json : [json];
        items.forEach((entry: any, idx: number) => {
          const p = chunk[idx]; if (!p) return;
          const times: string[] = entry?.hourly?.time ?? [], codes: number[] = entry?.hourly?.weathercode ?? [];
          const precs: number[] = entry?.hourly?.precipitation ?? [], winds: number[] = entry?.hourly?.windspeed_10m ?? [];
          const dirs: number[] = entry?.hourly?.winddirection_10m ?? [];
          const nowMs = Date.now();
          for (let j = 0; j < times.length; j++) {
            const code = codes[j], precip = precs[j] ?? 0;
            if (code !== 99 && !(code === 96 && precip >= 6)) continue;
            const tMs = new Date(times[j]+"Z").getTime();
            if (tMs < nowMs - 3600_000) continue;
            const isLive = Math.abs(tMs - nowMs) < 3600_000;
            const sizeMm = code === 99 ? 22 : 12;
            events.push({
              source: "openmeteo", external_id: `om-${p.key}-${times[j]}`,
              city: p.city ?? null, country: p.country,
              lat: p.lat, lng: p.lng, radius_km: 35,
              severity: code === 99 ? "severe" : "moderate",
              status: isLive ? "ongoing" : "forecast",
              hail_size_mm: sizeMm, probability: code === 99 ? 0.7 : 0.55,
              intensity: code === 99 ? 72 : 48,
              storm_speed_kmh: winds[j] ?? null, storm_direction_deg: dirs[j] ?? null,
              forecast_time: isLive ? null : times[j]+"Z",
              observed_time: isLive ? times[j]+"Z" : null,
              expires_at: new Date(tMs + 3600_000).toISOString(),
              metadata: { grid: p.key, wmo_code: code, precipitation_mm: precip },
            });
          }
        });
      } catch (e) { console.warn(`[openmeteo] chunk ${i} failed:`, (e as Error).message); }
    }
    ctx.cache.set({ key: cacheKey, payload: events, ttlSeconds: 600 });
    return events;
  },
};

/* Convective Inference (OpenMeteo atmospheric instability) */
interface InstabilityInput { cape: number|null; liftedIndex: number|null; freezingLevelM: number|null; cin: number|null; precipMm: number|null; weatherCode: number|null; highCloudPct: number|null; windGustKmh: number|null; }
interface OperationalScore { score: number; severity: Severity; hailProbability: number; inferredHailMm: number; confidence: number; }

function scoreConvectiveHail(x: InstabilityInput): OperationalScore {
  let score = 0, signals = 0;
  if (x.cape != null) {
    if (x.cape >= 3500) { score += 38; signals++; } else if (x.cape >= 2500) { score += 28; signals++; }
    else if (x.cape >= 1500) { score += 16; signals++; } else if (x.cape >= 1000) { score += 5; }
  }
  if (x.liftedIndex != null) {
    if (x.liftedIndex <= -8) { score += 22; signals++; } else if (x.liftedIndex <= -5) { score += 15; signals++; }
    else if (x.liftedIndex <= -2) { score += 6; }
  }
  if (x.freezingLevelM != null) {
    if (x.freezingLevelM < 2800) { score += 14; signals++; } else if (x.freezingLevelM < 3500) { score += 8; }
    else if (x.freezingLevelM < 4200) { score += 3; }
  }
  if (x.weatherCode != null) {
    if (x.weatherCode === 99) { score += 22; signals++; } else if (x.weatherCode === 96) { score += 14; signals++; }
    else if (x.weatherCode === 95) { score += 5; }
  }
  if (x.windGustKmh != null) {
    if (x.windGustKmh >= 90) { score += 10; signals++; } else if (x.windGustKmh >= 70) { score += 6; signals++; }
    else if (x.windGustKmh >= 50) { score += 2; }
  }
  if (x.highCloudPct != null && x.highCloudPct >= 80) { score += 3; }
  if (x.precipMm != null) { if (x.precipMm >= 15) { score += 4; } else if (x.precipMm >= 8) { score += 2; } }
  if (x.cin != null) { if (x.cin <= -200) { score -= 22; } else if (x.cin <= -100) { score -= 10; } }
  if (x.cape != null && x.cape >= 1500 && x.liftedIndex != null && x.liftedIndex <= -4 && x.weatherCode != null && (x.weatherCode === 96 || x.weatherCode === 99)) { score += 8; signals++; }
  score = Math.max(0, Math.min(100, Math.round(score)));
  let severity: Severity = "low";
  if (score >= 81) severity = "extreme"; else if (score >= 61) severity = "severe"; else if (score >= 41) severity = "moderate";
  let inferredHailMm = 0;
  if (x.cape != null && x.cape >= 800) {
    inferredHailMm = Math.max(0, Math.sqrt(Math.max(0, x.cape - 500)) * 0.42);
    if (x.freezingLevelM != null && x.freezingLevelM < 3200) inferredHailMm *= 1.25;
  }
  inferredHailMm = Math.min(80, Math.round(inferredHailMm));
  const confTable = [0, 0.25, 0.45, 0.65, 0.8, 0.92, 0.96];
  const confidence = confTable[Math.min(signals, 6)];
  const hailProbability = Math.min(0.95, (score / 100) * (0.5 + confidence * 0.5));
  return { score, severity, hailProbability, inferredHailMm, confidence };
}

const ConvectiveInference: WeatherProvider = {
  key: "convective_inference", capabilities: ["hail","severe","storm_cells"],
  async fetchHail(ctx) {
    const cacheKey = `ci:hail:global`;
    const cached = ctx.cache.get(cacheKey); if (cached) return cached as HailEvent[];
    const events: HailEvent[] = [];
    const chunkSize = 8;
    for (let i = 0; i < GLOBAL_GRID.length; i += chunkSize) {
      const chunk = GLOBAL_GRID.slice(i, i + chunkSize);
      const lats = chunk.map(p => p.lat).join(","), lngs = chunk.map(p => p.lng).join(",");
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&hourly=cape,lifted_index,freezing_level_height,convective_inhibition,precipitation,weathercode,cloudcover_high,wind_gusts_10m&forecast_days=2&timezone=UTC`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) continue;
        const json = await res.json();
        const items = Array.isArray(json) ? json : [json];
        items.forEach((entry: any, idx: number) => {
          const p = chunk[idx]; if (!p) return;
          const h = entry?.hourly ?? {}, times: string[] = h.time ?? [], nowMs = Date.now();
          for (let j = 0; j < times.length; j += 3) {
            const tMs = new Date(times[j]+"Z").getTime();
            if (tMs < nowMs - 3600_000 || tMs > nowMs + 24*3600_000) continue;
            const input: InstabilityInput = {
              cape: h.cape?.[j] ?? null, liftedIndex: h.lifted_index?.[j] ?? null,
              freezingLevelM: h.freezing_level_height?.[j] ?? null, cin: h.convective_inhibition?.[j] ?? null,
              precipMm: h.precipitation?.[j] ?? null, weatherCode: h.weathercode?.[j] ?? null,
              highCloudPct: h.cloudcover_high?.[j] ?? null, windGustKmh: h.wind_gusts_10m?.[j] ?? null,
            };
            const op = scoreConvectiveHail(input);
            if (op.score < 41 || op.confidence < 0.45) continue;
            const isLive = Math.abs(tMs - nowMs) < 90*60_000;
            const radiusKm = op.severity === "extreme" ? 45 : op.severity === "severe" ? 35 : 25;
            events.push({
              source: "convective_inference", external_id: `ci-${p.key}-${times[j]}`,
              city: p.city ?? null, country: p.country, lat: p.lat, lng: p.lng, radius_km: radiusKm,
              severity: op.severity, status: isLive ? "ongoing" : "forecast",
              hail_size_mm: op.inferredHailMm || null, probability: op.hailProbability,
              intensity: op.score, storm_speed_kmh: input.windGustKmh ?? null,
              forecast_time: isLive ? null : times[j]+"Z", observed_time: isLive ? times[j]+"Z" : null,
              expires_at: new Date(tMs + 3*3600_000).toISOString(),
              metadata: { engine: "convective_inference", v: 4, grid: p.key, op_score: op.score, confidence: op.confidence },
            });
          }
        });
      } catch (e) { console.warn(`[ci] chunk ${i} failed:`, (e as Error).message); }
    }
    ctx.cache.set({ key: cacheKey, payload: events, ttlSeconds: 900 });
    return events;
  },
};

/* TomorrowIo (paid, uses TOMORROW_API_KEY) */
const TomorrowIo: WeatherProvider = {
  key: "tomorrowio", capabilities: ["hail","precipitation","wind","storm_cells"],
  async fetchHail(ctx) {
    if (!ctx.apiKey) return [];
    const cacheKey = `tio:hail:global`;
    const cached = ctx.cache.get(cacheKey); if (cached) return cached as HailEvent[];
    const events: HailEvent[] = [];
    const maxCalls = 18, stride = Math.max(1, Math.floor(GLOBAL_GRID.length / maxCalls));
    const targets = GLOBAL_GRID.filter((_, i) => i % stride === 0).slice(0, maxCalls);
    for (const p of targets) {
      try {
        const url = `https://api.tomorrow.io/v4/weather/forecast?location=${p.lat},${p.lng}&apikey=${ctx.apiKey}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const json = await res.json();
        for (const hh of (json?.timelines?.hourly ?? []).slice(0, 24)) {
          const v = hh.values ?? {}; if (!v.hailBinary) continue;
          const sizeMm = (v.hailSize ?? 10) * 1;
          events.push({
            source: "tomorrowio", external_id: `tio-${p.key}-${hh.time}`,
            city: p.city ?? null, country: p.country, lat: p.lat, lng: p.lng, radius_km: 25,
            severity: severityFromHailMm(sizeMm), status: "forecast", hail_size_mm: sizeMm,
            probability: (v.precipitationProbability ?? 50) / 100,
            intensity: Math.min(100, sizeMm * 1.5),
            storm_speed_kmh: v.windSpeed ? v.windSpeed * 3.6 : null,
            storm_direction_deg: v.windDirection ?? null,
            forecast_time: hh.time, expires_at: new Date(new Date(hh.time).getTime() + 3600_000).toISOString(),
            metadata: { grid: p.key },
          });
        }
      } catch (e) { console.warn(`[tomorrowio] ${p.key} failed:`, (e as Error).message); }
    }
    ctx.cache.set({ key: cacheKey, payload: events, ttlSeconds: 900 });
    return events;
  },
};

/* ---- Merge pass ---- */
const MERGE_RADIUS_KM = 80, MERGE_WINDOW_MIN = 90;
const SOURCE_PRIORITY: Record<string,number> = { noaa:100, meteofrance:95, tomorrowio:70, openmeteo:50, convective_inference:35 };
const SEVERITY_RANK: Record<Severity,number> = { low:1, moderate:2, severe:3, extreme:4 };
const STATUS_RANK: Record<Status,number> = { forecast:1, ongoing:2, confirmed:3, closed:0 };

function eventTimeMs(e: HailEvent): number {
  const t = e.observed_time ?? e.forecast_time ?? e.expires_at;
  return t ? new Date(t).getTime() : Date.now();
}

function mergeTwo(winner: HailEvent, loser: HailEvent): HailEvent {
  const sev = SEVERITY_RANK[loser.severity] > SEVERITY_RANK[winner.severity] ? loser.severity : winner.severity;
  const status = STATUS_RANK[loser.status] > STATUS_RANK[winner.status] ? loser.status : winner.status;
  const hail = Math.max(winner.hail_size_mm ?? 0, loser.hail_size_mm ?? 0) || null;
  const meta = { ...(winner.metadata ?? {}) } as Record<string,unknown>;
  const mf = Array.isArray(meta.merged_from) ? (meta.merged_from as any[]) : [];
  mf.push({ source: loser.source, external_id: loser.external_id, severity: loser.severity });
  meta.merged_from = mf; meta.merge_count = mf.length;
  return { ...winner, severity: sev, status, hail_size_mm: hail,
    probability: Math.max(winner.probability ?? 0, loser.probability ?? 0) || null,
    intensity: Math.max(winner.intensity ?? 0, loser.intensity ?? 0) || null,
    radius_km: Math.max(winner.radius_km ?? 25, loser.radius_km ?? 25), metadata: meta };
}

function mergeEvents(events: HailEvent[]): HailEvent[] {
  const sorted = [...events].sort((a,b) => { const pa=SOURCE_PRIORITY[a.source]??10,pb=SOURCE_PRIORITY[b.source]??10; return pb!==pa?pb-pa:SEVERITY_RANK[b.severity]-SEVERITY_RANK[a.severity]; });
  const kept: HailEvent[] = [];
  for (const ev of sorted) {
    const tEv = eventTimeMs(ev);
    let mi = -1;
    for (let i = 0; i < kept.length; i++) {
      if (Math.abs(eventTimeMs(kept[i]) - tEv) > MERGE_WINDOW_MIN * 60_000) continue;
      if (haversineKm(kept[i].lat, kept[i].lng, ev.lat, ev.lng) > MERGE_RADIUS_KM) continue;
      kept[i] = mergeTwo(kept[i], ev); mi = i; break;
    }
    if (mi === -1) kept.push(ev);
  }
  return kept;
}

/* ---- Ingest runner ---- */
export async function runWeatherIngest(prisma: PrismaClient): Promise<{ upserted: number; kept: number; duration_ms: number }> {
  const t0 = Date.now();
  const cache = globalCache;
  const tomorrowKey = process.env["TOMORROW_API_KEY"];

  const providers: WeatherProvider[] = [MeteoFrance, NOAA, OpenMeteo, ConvectiveInference];
  if (tomorrowKey) providers.push(TomorrowIo);

  const allEvents: HailEvent[] = [];
  const seen = new Set<string>();

  for (const provider of providers) {
    if (!provider.fetchHail) continue;
    try {
      const ctx: FetchContext = { apiKey: provider.key === "tomorrowio" ? tomorrowKey : undefined, regionKey: "global", cache };
      const events = await provider.fetchHail(ctx);
      for (const e of events) {
        const id = `${e.source}|${e.external_id}`;
        if (!seen.has(id)) { seen.add(id); allEvents.push(e); }
      }
    } catch (e) {
      console.warn(`[weather-ingest] provider ${provider.key} failed:`, (e as Error).message);
    }
  }

  const merged = mergeEvents(allEvents);
  let upserted = 0;

  for (const e of merged) {
    try {
      await (prisma as any).hailEvent.upsert({
        where: { source_externalId: { source: e.source, externalId: e.external_id ?? "" } },
        create: {
          source: e.source, externalId: e.external_id ?? null,
          city: e.city ?? null, region: e.region ?? null, country: e.country ?? null,
          lat: e.lat, lng: e.lng, radiusKm: e.radius_km ?? 15,
          severity: e.severity, status: e.status,
          hailSizeMm: e.hail_size_mm ?? null, probability: e.probability ?? null,
          intensity: e.intensity ?? null, stormSpeedKmh: e.storm_speed_kmh ?? null,
          stormDirectionDeg: e.storm_direction_deg ?? null,
          forecastTime: e.forecast_time ? new Date(e.forecast_time) : null,
          observedTime: e.observed_time ? new Date(e.observed_time) : null,
          expiresAt: e.expires_at ? new Date(e.expires_at) : null,
          metadata: (e.metadata ?? {}) as any,
        },
        update: {
          severity: e.severity, status: e.status,
          hailSizeMm: e.hail_size_mm ?? null, probability: e.probability ?? null,
          intensity: e.intensity ?? null, stormSpeedKmh: e.storm_speed_kmh ?? null,
          stormDirectionDeg: e.storm_direction_deg ?? null,
          forecastTime: e.forecast_time ? new Date(e.forecast_time) : null,
          observedTime: e.observed_time ? new Date(e.observed_time) : null,
          expiresAt: e.expires_at ? new Date(e.expires_at) : null,
          metadata: (e.metadata ?? {}) as any,
        },
      });
      upserted++;
    } catch (e) { console.warn("[weather-ingest] upsert failed:", (e as Error).message); }
  }

  console.log(`[weather-ingest] done in ${Date.now()-t0}ms — kept ${merged.length}, upserted ${upserted}`);
  return { upserted, kept: merged.length, duration_ms: Date.now()-t0 };
}
