const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeCoordinates(body: any): [number, number][] {
  if (Array.isArray(body?.coordinates) && body.coordinates.length >= 2) {
    return body.coordinates
      .map((pair: unknown) => Array.isArray(pair) && pair.length === 2
        ? [Number(pair[0]), Number(pair[1])]
        : null)
      .filter((pair: [number, number] | null): pair is [number, number] => Array.isArray(pair) && pair.every((value) => Number.isFinite(value)));
  }

  if (
    Number.isFinite(body?.origin?.lat) &&
    Number.isFinite(body?.origin?.lng) &&
    Number.isFinite(body?.destination?.lat) &&
    Number.isFinite(body?.destination?.lng)
  ) {
    return [
      [Number(body.origin.lng), Number(body.origin.lat)],
      [Number(body.destination.lng), Number(body.destination.lat)],
    ];
  }

  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const OPENROUTE_API_KEY = Deno.env.get("OPENROUTE_API_KEY");
    if (!OPENROUTE_API_KEY) {
      return jsonResponse({ error: "OPENROUTE_API_KEY not configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const geocodeText = typeof body?.geocode_text === "string" ? body.geocode_text.trim() : "";

    if (geocodeText) {
      console.log("Geocoding:", geocodeText);

      const geocodeRes = await fetch(
        `https://api.openrouteservice.org/geocode/search?text=${encodeURIComponent(geocodeText)}&size=1`,
        {
          method: "GET",
          headers: {
            Authorization: OPENROUTE_API_KEY,
          },
        },
      );

      if (!geocodeRes.ok) {
        const errText = await geocodeRes.text();
        console.error("ORS geocode error:", geocodeRes.status, errText);
        return jsonResponse({ error: `Geocode API error: ${geocodeRes.status}`, details: errText }, 502);
      }

      const geocodeData = await geocodeRes.json();
      console.log("Resposta API:", geocodeData);

      const feature = geocodeData?.features?.[0];
      const coordinates = feature?.geometry?.coordinates;

      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return jsonResponse({ error: "Address not found" }, 404);
      }

      const [longitude, latitude] = coordinates;
      console.log("Coordenadas:", latitude, longitude);

      return jsonResponse({
        latitude: Number(latitude),
        longitude: Number(longitude),
        label: feature?.properties?.label ?? geocodeText,
      });
    }

    const normalizedCoordinates = normalizeCoordinates(body);

    if (normalizedCoordinates.length < 2) {
      return jsonResponse({ error: "Missing route coordinates" }, 400);
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
      return jsonResponse({ error: `Route API error: ${orsRes.status}`, details: errText }, 502);
    }

    const orsData = await orsRes.json();
    console.log("Resposta API:", orsData);
    const route = orsData.routes?.[0];
    const summary = route?.summary;

    if (!summary) {
      return jsonResponse({ error: "No route found between points" }, 404);
    }

    const distance_km = Number(summary.distance ?? 0) / 1000;
    const duration_min = Number(summary.duration ?? 0) / 60;
    const segments = Array.isArray(route?.segments) && route.segments.length > 0
      ? route.segments.map((segment: any) => ({
          distance_km: Number(segment?.distance ?? segment?.summary?.distance ?? 0) / 1000,
          duration_min: Number(segment?.duration ?? segment?.summary?.duration ?? 0) / 60,
        }))
      : [{ distance_km, duration_min }];

    return jsonResponse({ distance_km, duration_min, segments });
  } catch (error) {
    console.error("calculate-route error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
