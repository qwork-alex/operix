// Hail ingest layer — extensible weather provider integration.
// Currently a stub that returns "not configured" for every provider so the
// frontend operational map keeps working. To activate a provider:
//   1. Add the provider's API key as a Supabase secret
//   2. Implement `fromMeteoFrance` / `fromEssl` / `fromTomorrowIo` / `fromWeatherbit`
//   3. Each fetcher must return HailEvent[] in the canonical shape below
//   4. Upsert into public.hail_events using (source, external_id) as the dedupe key

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type HailEvent = {
  source: "meteofrance" | "essl" | "tomorrowio" | "weatherbit";
  external_id: string;
  city?: string;
  region?: string;
  country?: string;
  lat: number;
  lng: number;
  radius_km?: number;
  severity: "low" | "moderate" | "severe" | "extreme";
  status: "forecast" | "ongoing" | "confirmed" | "closed";
  hail_size_mm?: number;
  probability?: number;
  intensity?: number;
  storm_speed_kmh?: number;
  storm_direction_deg?: number;
  forecast_time?: string;
  observed_time?: string;
  expires_at?: string;
  metadata?: Record<string, unknown>;
};

async function fromMeteoFrance(): Promise<HailEvent[]> {
  // TODO: integrate https://meteofrance.com vigilance feed (free, XML)
  return [];
}
async function fromEssl(): Promise<HailEvent[]> {
  // TODO: integrate ESSL European Severe Weather Database
  return [];
}
async function fromTomorrowIo(_apiKey: string): Promise<HailEvent[]> {
  // TODO: integrate Tomorrow.io severe weather endpoint
  return [];
}
async function fromWeatherbit(_apiKey: string): Promise<HailEvent[]> {
  // TODO: integrate Weatherbit severe alerts endpoint
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const TOMORROW_KEY = Deno.env.get("TOMORROWIO_API_KEY") ?? "";
    const WEATHERBIT_KEY = Deno.env.get("WEATHERBIT_API_KEY") ?? "";

    const events: HailEvent[] = [];
    const providerStatus: Record<string, string> = {};

    const tasks: Array<Promise<void>> = [
      fromMeteoFrance().then((r) => { events.push(...r); providerStatus.meteofrance = `ok:${r.length}`; })
        .catch((e) => { providerStatus.meteofrance = `error:${e.message}`; }),
      fromEssl().then((r) => { events.push(...r); providerStatus.essl = `ok:${r.length}`; })
        .catch((e) => { providerStatus.essl = `error:${e.message}`; }),
    ];
    if (TOMORROW_KEY) {
      tasks.push(
        fromTomorrowIo(TOMORROW_KEY).then((r) => { events.push(...r); providerStatus.tomorrowio = `ok:${r.length}`; })
          .catch((e) => { providerStatus.tomorrowio = `error:${e.message}`; })
      );
    } else providerStatus.tomorrowio = "no_api_key";
    if (WEATHERBIT_KEY) {
      tasks.push(
        fromWeatherbit(WEATHERBIT_KEY).then((r) => { events.push(...r); providerStatus.weatherbit = `ok:${r.length}`; })
          .catch((e) => { providerStatus.weatherbit = `error:${e.message}`; })
      );
    } else providerStatus.weatherbit = "no_api_key";

    await Promise.all(tasks);

    let upserted = 0;
    if (events.length > 0) {
      const { data, error } = await supabase
        .from("hail_events")
        .upsert(events, { onConflict: "source,external_id" })
        .select("id");
      if (error) throw error;
      upserted = data?.length ?? 0;
    }

    return new Response(
      JSON.stringify({ ok: true, upserted, providers: providerStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
