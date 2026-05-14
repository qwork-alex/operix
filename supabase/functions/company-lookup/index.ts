// Edge function: company-lookup
// Country-first orchestrator with isolated per-request session, parallel FR providers,
// strict country gating (no FR/PT/BR cross-leak) and confidence engine gated at 85%.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import type { LookupResult, NormalizedCompany, ProviderLog } from "./core.ts";
import { joinAddress, isValidSiren, isValidSiret } from "./core.ts";
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

// Pick the kind/country pairs that match the country hint first; fall through only if no FR-side match exists.
function orderCandidatesByCountry(
  candidates: ClassificationCandidate[],
  countryHint: string,
): ClassificationCandidate[] {
  const preferred = candidates.filter((c) => c.country === countryHint);
  const eu        = candidates.filter((c) => c.country !== countryHint && c.country && ["FR","BE","LU","DE","IT","ES","PT","NL"].includes(c.country));
  const rest      = candidates.filter((c) => !preferred.includes(c) && !eu.includes(c));
  return [...preferred, ...eu, ...rest];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();
  const sessionId = crypto.randomUUID(); // search session isolation: per-request id
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
    const ordered = orderCandidatesByCountry(classification.candidates, countryHint);
    const best = ordered[0] ?? classification.best;

    // Fresh, request-scoped state — never reused across calls.
    const ctx: { query: string; kind: any; country: string | null; logs: ProviderLog[]; session_id: string } = {
      query: query.trim(), kind: best.kind, country: best.country, logs: [], session_id: sessionId,
    };

    let result: NormalizedCompany | null = null;
    let candidates: NormalizedCompany[] = [];
    let vies: any = null;

    // ── Country Registry pass (NEW countries only: DE/ES/CH/GB/US/IN/CN). ──
    // Frozen jurisdictions (FR/PT/BE/NL/IT/BR) are intentionally NOT routed here.
    // Runs BEFORE the legacy switch so high-confidence registry detections win,
    // but only when the detected country belongs to the modular set.
    const registryHits = detectAcrossRegistry(query);
    const FROZEN = new Set(["FR","PT","BE","NL","IT","BR"]);
    const topRegistry = registryHits.find((d) => !FROZEN.has(d.country));
    if (topRegistry) {
      const mod = resolveModule(topRegistry.country);
      if (mod) {
        const cctx = {
          query: query.trim(), detected_kind: topRegistry.kind,
          country: topRegistry.country, logs: ctx.logs, session_id: sessionId,
        };
        const r = await mod.lookup(cctx);
        if (r) {
          result = r;
          ctx.kind = topRegistry.kind as any;
          ctx.country = topRegistry.country;
        }
      }
    }

    if (!result) {
      for (const cand of ordered) {
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
            // VIES validates regardless, but only enrich with VIES when no FR result.
            const v = await europeVatProvider.validate(ctx.query, ctx);
            vies = v.vies;
            if (!result && v.company && (ctx.country == null || v.company.country === ctx.country)) {
              result = v.company;
            }
            break;
          }
          case "cnpj":   if (countryHint === "BR" || classification.candidates.find((x) => x.kind === "cnpj" && x.score >= 0.8)) result = await brazilProvider.lookup(ctx); break;
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
    }

    // Strict country isolation: if user is in FR context and a non-FR result slipped through
    // a name-based fallback, demote it to "unverified" so it does not auto-apply.
    if (result && countryHint && result.country && result.country !== countryHint && result.provider === "generic") {
      result.confidence = "unverified";
    }

    // Address Intelligence pass
    result = enrichAddress(result);
    candidates = candidates.map((c) => enrichAddress(c)!).filter(Boolean);

    // Identifier-validity boost: exact Luhn pass adds to format score.
    let formatScore = best.score;
    if (best.kind === "siren" && isValidSiren(query)) formatScore = Math.min(1, formatScore + 0.1);
    if (best.kind === "siret" && isValidSiret(query)) formatScore = Math.min(1, formatScore + 0.1);

    const conf = scoreCompany({ company: result, formatScore, countryHint });
    if (result) result.confidence = conf.level;

    const payload: LookupResult & {
      classification: { detected_kind: string; country: string | null; score: number; candidates: ClassificationCandidate[] };
      confidence_breakdown: ConfidenceBreakdown;
      country_hint: string;
      total_ms: number;
      provider_available: boolean;
      session_id: string;
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
      provider_available: true, // always true now: api.gouv.fr is keyless
      session_id: sessionId,
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "lookup_failed", message: String((e as any)?.message ?? e), session_id: sessionId }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
