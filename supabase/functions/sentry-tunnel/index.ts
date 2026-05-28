// Sentry Tunnel — forwards browser envelopes to Sentry ingest, bypassing
// preview/adblock blocks on *.ingest.sentry.io. Public endpoint (no JWT).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sentry-auth",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const KNOWN_INGEST_HOSTS = new Set([
  "o4511469175504896.ingest.de.sentry.io",
  "sentry.io",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  console.log("[sentry-tunnel] request received");
  try {
    const envelope = await req.text();
    const firstLine = envelope.split("\n", 1)[0];
    const header = JSON.parse(firstLine);
    const dsn = header.dsn as string | undefined;
    if (!dsn) {
      console.error("[sentry-tunnel] missing dsn in envelope header");
      return new Response("Bad envelope", { status: 400, headers: corsHeaders });
    }
    const dsnUrl = new URL(dsn);
    const projectId = dsnUrl.pathname.replace(/^\//, "");
    const host = dsnUrl.host;
    if (!KNOWN_INGEST_HOSTS.has(host)) {
      console.error("[sentry-tunnel] disallowed host:", host);
      return new Response("Forbidden host", { status: 403, headers: corsHeaders });
    }
    const upstream = `https://${host}/api/${projectId}/envelope/`;
    console.log("[sentry-tunnel] forwarding to sentry:", upstream);

    const resp = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
    });
    const body = await resp.text();
    if (!resp.ok) {
      console.error("[sentry-tunnel] forwarding failure", resp.status, body);
    } else {
      console.log("[sentry-tunnel] forwarding success", resp.status);
    }
    return new Response(body, {
      status: resp.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[sentry-tunnel] forwarding failure exception", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
