// Edge function: company-lookup
// Multi-provider orchestrator. Strategy: national → regional → global fallback.
// Never exposes upstream errors or keys. Returns a NormalizedCompany payload.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  detectDocument, type LookupResult, type ConfidenceLevel,
  type NormalizedCompany, type ProviderLog,
} from "./core.ts";
import {
  franceProvider, europeVatProvider, brazilProvider,
  usaProvider, canadaProvider, mexicoProvider,
  indiaProvider, japanProvider, genericProvider,
} from "./providers.ts";

function pickConfidence(c: NormalizedCompany | null, fallback: ConfidenceLevel = "unverified"): ConfidenceLevel {
  return c?.confidence ?? fallback;
}

function buildMessage(detected: string, c: NormalizedCompany | null, candidates: NormalizedCompany[], vies: any): string {
  if (c?.confidence === "fully_enriched") return `Empresa encontrada (${c.provider}).`;
  if (c?.confidence === "partially_enriched") return `Empresa parcialmente enriquecida (${c.provider}).`;
  if (c?.confidence === "validated") return `Documento ${detected.toUpperCase()} válido — enriquecimento indisponível para esta jurisdição.`;
  if (candidates.length) return `${candidates.length} candidatos encontrados — selecione um.`;
  if (vies && vies.valid === false) return `Número TVA inválido segundo o registro oficial.`;
  if (vies && vies.valid === true) return `TVA válido, mas sem dados adicionais disponíveis.`;
  return `Sem correspondência direta. Verifique o identificador ou tente outro provedor.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const query: string = (body?.query ?? "").toString();

    if (!query || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: "invalid_query" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const detected = detectDocument(query);
    const ctx = { query: query.trim(), kind: detected.kind, country: detected.country, logs: [] as ProviderLog[] };

    let result: NormalizedCompany | null = null;
    let candidates: NormalizedCompany[] = [];
    let vies: any = null;

    // 1) National-first router
    switch (ctx.kind) {
      case "siren":
      case "siret": {
        const r = await franceProvider.lookup(ctx);
        result = r.result; candidates = r.candidates;
        break;
      }
      case "vat_eu": {
        // Try national first if FR
        if (ctx.country === "FR") {
          const r = await franceProvider.lookup(ctx);
          result = r.result;
        }
        // Regional VIES validation always provides at least "validated"
        const v = await europeVatProvider.validate(ctx.query, ctx);
        vies = v.vies;
        if (!result) result = v.company;
        break;
      }
      case "cnpj": result = await brazilProvider.lookup(ctx); break;
      case "ein":  result = await usaProvider.lookup(ctx);    break;
      case "bn_ca": result = await canadaProvider.lookup(ctx); break;
      case "rfc_mx": result = await mexicoProvider.lookup(ctx); break;
      case "gstin": result = await indiaProvider.lookup(ctx); break;
      case "corp_jp": result = await japanProvider.lookup(ctx); break;
      case "name": {
        // Try France registry first (only enriched name source available right now)
        const r = await franceProvider.lookup(ctx);
        result = r.result; candidates = r.candidates;
        // Global fallback — generic stub so the form at least has a name
        if (!result && !candidates.length) {
          result = genericProvider.lookup(ctx);
        }
        break;
      }
    }

    const confidence = pickConfidence(result, candidates.length ? "partially_enriched" : "unverified");

    const payload: LookupResult = {
      detected_kind: detected.kind,
      detected_country: detected.country,
      result,
      candidates,
      vies,
      logs: ctx.logs,
      confidence,
      message: buildMessage(detected.kind, result, candidates, vies),
    };

    return new Response(JSON.stringify({ ...payload, total_ms: Date.now() - t0, provider_available: !!Deno.env.get("PAPPERS_API_KEY") }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "lookup_failed", message: String((e as any)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
