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
    const { origin, destination, trip_id, point_index } = body;

    if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
      return new Response(
        JSON.stringify({ error: "Missing origin or destination coordinates" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call OpenRouteService
    const orsRes = await fetch(
      "https://api.openrouteservice.org/v2/directions/driving-car",
      {
        method: "POST",
        headers: {
          Authorization: OPENROUTE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: [
            [origin.lng, origin.lat],
            [destination.lng, destination.lat],
          ],
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
    const summary = orsData.routes?.[0]?.summary;

    if (!summary) {
      return new Response(
        JSON.stringify({ error: "No route found between points" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const distance_km = summary.distance / 1000;
    const duration_min = summary.duration / 60;

    // If trip_id and point_index provided, update DB
    if (trip_id && point_index !== undefined) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from("fleet_trip_points")
        .update({
          distance_from_previous: Math.round(distance_km * 100) / 100,
          duration_from_previous: Math.round(duration_min * 100) / 100,
        })
        .eq("trip_id", trip_id)
        .eq("order_index", point_index);
    }

    return new Response(
      JSON.stringify({ distance_km, duration_min }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("calculate-route error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
