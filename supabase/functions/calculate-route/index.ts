import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const OPENROUTE_API_KEY = Deno.env.get("OPENROUTE_API_KEY");
    if (!OPENROUTE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENROUTE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { origin, destination, trip_id, point_index, coordinates } = body ?? {};

    const normalizedCoordinates = Array.isArray(coordinates) && coordinates.length >= 2
      ? coordinates
          .map((pair) => Array.isArray(pair) && pair.length === 2
            ? [Number(pair[0]), Number(pair[1])]
            : null)
          .filter((pair): pair is [number, number] => Array.isArray(pair) && pair.every((value) => Number.isFinite(value)))
      : Number.isFinite(origin?.lat) && Number.isFinite(origin?.lng) && Number.isFinite(destination?.lat) && Number.isFinite(destination?.lng)
        ? [
            [Number(origin.lng), Number(origin.lat)],
            [Number(destination.lng), Number(destination.lat)],
          ]
        : [];

    if (normalizedCoordinates.length < 2) {
      return new Response(
        JSON.stringify({ error: "Missing route coordinates" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Coordenadas:", normalizedCoordinates);

    const orsRes = await fetch(
      "https://api.openrouteservice.org/v2/directions/driving-car",
      {
        method: "POST",
        headers: {
          Authorization: OPENROUTE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: normalizedCoordinates,
        }),
      }
    );

    if (!orsRes.ok) {
      const errText = await orsRes.text();
      console.error("ORS error:", orsRes.status, errText);
      return new Response(
        JSON.stringify({ error: `Route API error: ${orsRes.status}`, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orsData = await orsRes.json();
    console.log("Resposta API:", orsData);
    const route = orsData.routes?.[0];
    const summary = route?.summary;

    if (!summary) {
      return new Response(
        JSON.stringify({ error: "No route found between points" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const distance_km = summary.distance / 1000;
    const duration_min = summary.duration / 60;
    const segments = Array.isArray(route?.segments) && route.segments.length > 0
      ? route.segments.map((segment: any) => ({
          distance_km: Number(segment?.distance ?? segment?.summary?.distance ?? 0) / 1000,
          duration_min: Number(segment?.duration ?? segment?.summary?.duration ?? 0) / 60,
        }))
      : [{ distance_km, duration_min }];

    if (trip_id && point_index !== undefined && segments.length === 1) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from("fleet_trip_points")
        .update({
          distance_from_previous: Math.round(segments[0].distance_km * 100) / 100,
          duration_from_previous: Math.round(segments[0].duration_min * 100) / 100,
        })
        .eq("trip_id", trip_id)
        .eq("order_index", point_index);
    }

    return new Response(
      JSON.stringify({ distance_km, duration_min, segments }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("calculate-route error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
