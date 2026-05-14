// Edge function: company-lookup
// Multi-provider orchestrator with score-based document classification,
// country-preference strategy (FR → EU → Global), and confidence engine.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import type { LookupResult, NormalizedCompany, ProviderLog } from "./core.ts";
import { joinAddress } from "./core.ts";
import { classifyDocument, type ClassificationCandidate } from "./classifiers/document-classifier.ts";
import { parseAddressIntelligent, joinAddressLine } from "./parsers/address-parser.ts";
import { scoreCompany, type ConfidenceBreakdown } from "./confidence-engine/score.ts";
import {
  franceProvider, europeVatProvider, brazilProvider,
  usaProvider, canadaProvider, mexicoProvider,
  indiaProvider, japanProvider, genericProvider,
} from "./providers.ts";

function enrichAddress(c: NormalizedCompany | null): NormalizedCompany | null {
  if (!c) return c;
  // If structured address is mostly empty but we have an address_line, parse it.
  const a = c.address ?? {};
  const empty = !a.street && !a.city && !a.postal_code;
  if (empty && c.address_line) {
    const parsed = parseAddressIntelligent(c.address_line, c.country);
    c.address = {
      street: parsed.street, street_number: parsed.street_number,
      postal_code: parsed.postal_code, city: parsed.city,
      state: parsed.state, country: parsed.country,
    };
    (c as any).address_complement = parsed.complement;
    c.address_line = joinAddressLine(c.address, parsed.complement) ?? c.address_line;
  } else if (!c.address_line) {
    c.address_line = joinAddress(c.address);
  }
  return c;
}

function buildMessage(
  best: ClassificationCandidate,
  c: NormalizedCompany | null,
  candidates: NormalizedCompany[],
  vies: any,
  conf: ConfidenceBreakdown,
): string {
  if (c && conf.auto_apply) return `Empresa identificada com alta confiança (${c.provider}, ${(conf.total * 100).toFixed(0)}%).`;
  if (c && conf.level === "partially_enriched") return `Empresa parcialmente enriquecida (${c.provider}) — confirme antes de aplicar.`;
  if (c && conf.level === "validated") return `Documento ${best.kind.toUpperCase()} válido — confirme manualmente.`;
  if (candidates.length) return `${candidates.length} candidatos encontrados — selecione um.`;
  if (vies && vies.valid === false) return `Número TVA inválido segundo o registro oficial.`;
  if (vies && vies.valid === true) return `TVA válido, mas sem dados adicionais.`;
  return `Sem correspondência confiável. Verifique o identificador.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const query: string = (body?.query ?? "").toString();
    const countryHint: string = (body?.country_hint ?? "FR").toString().toUpperCase();

    if (!query || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: "invalid_query" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const classification = classifyDocument(query, countryHint);
    const best = classification.best;
    const ctx = { query: query.trim(), kind: best.kind, country: best.country, logs: [] as ProviderLog[] };

    let result: NormalizedCompany | null = null;
    let candidates: NormalizedCompany[] = [];
    let vies: any = null;

    // Try the top classification candidates in order until one yields a result.
    for (const cand of classification.candidates) {
      ctx.kind = cand.kind; ctx.country = cand.country;

      switch (cand.kind) {
        case "siren":
        case "siret": {
          const r = await franceProvider.lookup(ctx);
          result = r.result; candidates = r.candidates; break;
        }
        case "vat_eu": {
          if (ctx.country === "FR") {
            const r = await franceProvider.lookup(ctx);
            result = r.result;
          }
          const v = await europeVatProvider.validate(ctx.query, ctx);
          vies = v.vies;
          if (!result) result = v.company;
          break;
        }
        case "cnpj":   result = await brazilProvider.lookup(ctx); break;
        case "ein":    result = await usaProvider.lookup(ctx);    break;
        case "bn_ca":  result = await canadaProvider.lookup(ctx); break;
        case "rfc_mx": result = await mexicoProvider.lookup(ctx); break;
        case "gstin":  result = await indiaProvider.lookup(ctx);  break;
        case "corp_jp":result = await japanProvider.lookup(ctx);  break;
        case "name": {
          const r = await franceProvider.lookup(ctx);
          result = r.result; candidates = r.candidates;
          if (!result && !candidates.length) result = genericProvider.lookup(ctx);
          break;
        }
      }

      if (result || candidates.length) break;
    }

    // Address Intelligence pass
    result = enrichAddress(result);
    candidates = candidates.map((c) => enrichAddress(c)!).filter(Boolean);

    // Confidence Engine
    const conf = scoreCompany({ company: result, formatScore: best.score, countryHint });
    if (result) result.confidence = conf.level;

    const payload: LookupResult & {
      classification: { detected_kind: string; country: string | null; score: number; candidates: ClassificationCandidate[] };
      confidence_breakdown: ConfidenceBreakdown;
      country_hint: string;
      total_ms: number;
      provider_available: boolean;
    } = {
      detected_kind: best.kind,
      detected_country: best.country,
      result,
      candidates,
      vies,
      logs: ctx.logs,
      confidence: conf.level,
      message: buildMessage(best, result, candidates, vies, conf),
      classification: {
        detected_kind: best.kind, country: best.country, score: best.score,
        candidates: classification.candidates,
      },
      confidence_breakdown: conf,
      country_hint: countryHint,
      total_ms: Date.now() - t0,
      provider_available: !!Deno.env.get("PAPPERS_API_KEY"),
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "lookup_failed", message: String((e as any)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
