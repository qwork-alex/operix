// Edge function: company-lookup
// Searches French (and future EU) company registries by SIREN, SIRET, TVA or name.
// Returns a normalized payload — never exposes raw upstream errors or keys.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type QueryType = "siren" | "siret" | "vat" | "name";

interface NormalizedCompany {
  company_name: string | null;
  siren: string | null;
  siret: string | null;
  vat_number: string | null;
  legal_form: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  creation_date: string | null;
  company_status: string | null;
  source: string;
}

const TIMEOUT_MS = 8000;

function detectType(raw: string): QueryType {
  const v = raw.trim();
  const digits = v.replace(/\D/g, "");
  if (/^FR/i.test(v) && digits.length >= 9) return "vat";
  if (digits.length === 9 && digits === v.replace(/\s/g, "")) return "siren";
  if (digits.length === 14 && digits === v.replace(/\s/g, "")) return "siret";
  if (digits.length === 9) return "siren";
  if (digits.length === 14) return "siret";
  return "name";
}

function vatFromSiren(siren: string): string {
  const n = BigInt(siren);
  const key = Number((12n + 3n * (n % 97n)) % 97n);
  return `FR${key.toString().padStart(2, "0")}${siren}`;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

function normalizePappers(data: any, country = "France"): NormalizedCompany {
  const siege = data?.siege ?? {};
  const siren: string | null = data?.siren ?? null;
  return {
    company_name: data?.nom_entreprise ?? data?.denomination ?? null,
    siren,
    siret: siege?.siret ?? data?.siret ?? null,
    vat_number: data?.numero_tva_intracommunautaire ?? (siren ? vatFromSiren(siren) : null),
    legal_form: data?.forme_juridique ?? null,
    address:
      [siege?.numero_voie, siege?.type_voie, siege?.libelle_voie]
        .filter(Boolean)
        .join(" ")
        .trim() || siege?.adresse_ligne_1 || null,
    postal_code: siege?.code_postal ?? null,
    city: siege?.ville ?? null,
    country,
    creation_date: data?.date_creation ?? null,
    company_status: data?.entreprise_cessee ? "ceased" : "active",
    source: "pappers",
  };
}

async function pappersByIdentifier(query: string, type: "siren" | "siret"): Promise<NormalizedCompany | null> {
  const key = Deno.env.get("PAPPERS_API_KEY");
  if (!key) return null;
  const url =
    type === "siren"
      ? `https://api.pappers.fr/v2/entreprise?siren=${encodeURIComponent(query)}&api_token=${key}`
      : `https://api.pappers.fr/v2/entreprise?siret=${encodeURIComponent(query)}&api_token=${key}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) return null;
  const data = await r.json();
  return normalizePappers(data);
}

async function pappersByName(query: string): Promise<NormalizedCompany[]> {
  const key = Deno.env.get("PAPPERS_API_KEY");
  if (!key) return [];
  const url = `https://api.pappers.fr/v2/recherche?q=${encodeURIComponent(query)}&api_token=${key}&par_page=8`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) return [];
  const data = await r.json();
  return (data?.resultats ?? []).map((x: any) => normalizePappers(x));
}

async function viesValidate(vat: string): Promise<{ valid: boolean; name?: string; address?: string } | null> {
  const m = vat.replace(/\s/g, "").match(/^([A-Z]{2})(.+)$/i);
  if (!m) return null;
  const country = m[1].toUpperCase();
  const number = m[2];
  // VIES REST proxy — public, no key. Falls back to null on error.
  try {
    const r = await fetchWithTimeout(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${country}/vat/${encodeURIComponent(number)}`,
    );
    if (!r.ok) return null;
    const data = await r.json();
    return {
      valid: !!data?.isValid,
      name: data?.name ?? undefined,
      address: data?.address ?? undefined,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { query } = await req.json().catch(() => ({ query: "" }));
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: "invalid_query" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const type = detectType(query);
    const trimmed = query.trim();

    let result: NormalizedCompany | null = null;
    let candidates: NormalizedCompany[] = [];
    let viesInfo: { valid: boolean; name?: string; address?: string } | null = null;

    if (type === "siren") {
      result = await pappersByIdentifier(trimmed.replace(/\D/g, ""), "siren");
    } else if (type === "siret") {
      result = await pappersByIdentifier(trimmed.replace(/\D/g, ""), "siret");
    } else if (type === "vat") {
      const cleanVat = trimmed.replace(/\s/g, "").toUpperCase();
      viesInfo = await viesValidate(cleanVat);
      // If FR, derive SIREN and enrich via Pappers
      if (cleanVat.startsWith("FR")) {
        const siren = cleanVat.slice(4);
        if (/^\d{9}$/.test(siren)) {
          result = await pappersByIdentifier(siren, "siren");
        }
      }
      if (!result && viesInfo?.valid) {
        result = {
          company_name: viesInfo.name ?? null,
          siren: null, siret: null,
          vat_number: cleanVat,
          legal_form: null,
          address: viesInfo.address ?? null,
          postal_code: null, city: null,
          country: cleanVat.slice(0, 2),
          creation_date: null,
          company_status: "active",
          source: "vies",
        };
      }
    } else {
      candidates = await pappersByName(trimmed);
      if (candidates.length === 1) result = candidates[0];
    }

    return new Response(
      JSON.stringify({
        type,
        result,
        candidates,
        vies: viesInfo,
        provider_available: !!Deno.env.get("PAPPERS_API_KEY"),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "lookup_failed", message: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
