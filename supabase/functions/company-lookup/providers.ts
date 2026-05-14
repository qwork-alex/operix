// Decoupled providers — each call receives an isolated Ctx (no cross-search state).
// FR primary stack: Recherche-Entreprises (api.gouv.fr — free, official) → Pappers (paid, optional).
// VIES used only for VAT validation, never as authoritative enrichment outside its country.
import {
  type NormalizedCompany, type DocumentKind, type ProviderLog,
  emptyCompany, fetchWithTimeout, joinAddress, vatFromSiren,
  isValidSiren, isValidSiret,
} from "./core.ts";
import { parseAddressIntelligent } from "./parsers/address-parser.ts";

interface Ctx {
  query: string;
  kind: DocumentKind;
  country: string | null;
  logs: ProviderLog[];
  // session id used only for log correlation; state lives nowhere global.
  session_id: string;
}

async function timed<T>(name: string, fn: () => Promise<T>, ctx: Ctx, notes?: string): Promise<T | null> {
  const t0 = Date.now();
  try {
    const r = await fn();
    ctx.logs.push({ provider: name, ms: Date.now() - t0, ok: r != null, notes });
    return r;
  } catch (e) {
    ctx.logs.push({ provider: name, ms: Date.now() - t0, ok: false, notes: String((e as any)?.message ?? e) });
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// FRANCE — Recherche-Entreprises (api.gouv.fr) — free, official, no key
// Docs: https://recherche-entreprises.api.gouv.fr/docs/
// ────────────────────────────────────────────────────────────────────
function normalizeRechercheEntreprise(d: any): NormalizedCompany {
  const c = emptyCompany("france-recherche-entreprises");
  const siege = d?.siege ?? {};
  const siren: string | null = d?.siren ?? null;
  c.country = "FR";
  c.company_name = d?.nom_complet ?? d?.nom_raison_sociale ?? null;
  c.legal_name = d?.nom_raison_sociale ?? c.company_name;
  c.legal_form = d?.nature_juridique ?? null;
  c.creation_date = d?.date_creation ?? null;
  c.company_status = d?.etat_administratif === "A" ? "active" : (d?.etat_administratif === "C" ? "ceased" : "unknown");
  c.siren = siren;
  c.siret = siege?.siret ?? null;
  c.tax_id = c.siren ?? c.siret;
  c.vat_number = siren ? vatFromSiren(siren) : null;

  const street = [siege?.numero_voie, siege?.type_voie, siege?.libelle_voie].filter(Boolean).join(" ").trim()
    || siege?.adresse || null;
  c.address = {
    street: street || null,
    street_number: siege?.numero_voie ?? null,
    postal_code: siege?.code_postal ?? null,
    city: siege?.libelle_commune ?? null,
    state: siege?.region ?? null,
    country: "France",
  };
  c.address_line = joinAddress(c.address);
  c.confidence = "fully_enriched";
  return c;
}

async function rechercheEntreprisesFetch(url: string, ctx: Ctx, providerLabel: string): Promise<any> {
  return await timed(providerLabel, async () => {
    const resp = await fetchWithTimeout(url, { headers: { "Accept": "application/json" } }, 7000);
    if (!resp.ok) return null;
    return await resp.json();
  }, ctx);
}

const RECHERCHE_BASE = "https://recherche-entreprises.api.gouv.fr";

async function rechercheBySiren(siren: string, ctx: Ctx): Promise<NormalizedCompany | null> {
  const data = await rechercheEntreprisesFetch(
    `${RECHERCHE_BASE}/search?q=${siren}&page=1&per_page=1`,
    ctx,
    "france-recherche-entreprises",
  );
  const r = data?.results?.[0];
  return r ? normalizeRechercheEntreprise(r) : null;
}

async function rechercheByName(query: string, ctx: Ctx): Promise<NormalizedCompany[]> {
  const data = await rechercheEntreprisesFetch(
    `${RECHERCHE_BASE}/search?q=${encodeURIComponent(query)}&page=1&per_page=8`,
    ctx,
    "france-recherche-entreprises",
  );
  const list: any[] = data?.results ?? [];
  return list.map(normalizeRechercheEntreprise);
}

// ────────────────────────────────────────────────────────────────────
// FRANCE — Pappers (optional, requires PAPPERS_API_KEY)
// ────────────────────────────────────────────────────────────────────
function normalizePappers(data: any): NormalizedCompany {
  const c = emptyCompany("france-pappers");
  const siege = data?.siege ?? {};
  const siren: string | null = data?.siren ?? null;
  c.country = "FR";
  c.company_name = data?.nom_entreprise ?? data?.denomination ?? null;
  c.legal_name = data?.denomination ?? c.company_name;
  c.legal_form = data?.forme_juridique ?? null;
  c.creation_date = data?.date_creation ?? null;
  c.company_status = data?.entreprise_cessee ? "ceased" : "active";
  c.siren = siren;
  c.siret = siege?.siret ?? data?.siret ?? null;
  c.tax_id = c.siren ?? c.siret;
  c.vat_number = data?.numero_tva_intracommunautaire ?? (siren ? vatFromSiren(siren) : null);
  const street = [siege?.numero_voie, siege?.type_voie, siege?.libelle_voie].filter(Boolean).join(" ").trim()
    || siege?.adresse_ligne_1 || null;
  c.address = {
    street: street || null,
    street_number: siege?.numero_voie ?? null,
    postal_code: siege?.code_postal ?? null,
    city: siege?.ville ?? null,
    state: null,
    country: "France",
  };
  c.address_line = joinAddress(c.address);
  c.confidence = "fully_enriched";
  return c;
}

async function pappersFetch(url: string, ctx: Ctx): Promise<any> {
  const key = Deno.env.get("PAPPERS_API_KEY");
  if (!key) return null;
  return await timed("france-pappers", async () => {
    const sep = url.includes("?") ? "&" : "?";
    const resp = await fetchWithTimeout(`${url}${sep}api_token=${key}`, undefined, 7000);
    if (!resp.ok) return null;
    return await resp.json();
  }, ctx);
}

// ────────────────────────────────────────────────────────────────────
// FRANCE orchestrator (parallel, ranked)
// ────────────────────────────────────────────────────────────────────
function rankFrCompany(c: NormalizedCompany | null): number {
  if (!c) return -1;
  let s = 0;
  if (c.company_name) s += 3;
  if (c.siren) s += 2;
  if (c.address?.postal_code) s += 1;
  if (c.address?.city) s += 1;
  if (c.legal_form) s += 1;
  if (c.creation_date) s += 1;
  if (c.provider === "france-pappers") s += 0.5; // tie-break to richer source
  return s;
}

export const franceProvider = {
  async lookup(ctx: Ctx): Promise<{ result: NormalizedCompany | null; candidates: NormalizedCompany[] }> {
    const q = ctx.query.trim();

    // Identifier search (SIREN / SIRET / FR VAT)
    if (ctx.kind === "siren" || ctx.kind === "siret" || (ctx.kind === "vat_eu" && q.toUpperCase().startsWith("FR"))) {
      let siren = q.replace(/\D/g, "");
      if (ctx.kind === "vat_eu") siren = q.replace(/\s/g, "").slice(4); // FR + 2 key + 9 siren
      if (ctx.kind === "siret") siren = siren.slice(0, 9);

      // Reject obviously-invalid identifiers (Luhn) — never spend network on garbage
      if (ctx.kind === "siren" && !isValidSiren(siren)) {
        ctx.logs.push({ provider: "france-validate", ms: 0, ok: false, notes: "invalid SIREN checksum" });
      }
      if (ctx.kind === "siret" && !isValidSiret(q.replace(/\D/g, ""))) {
        ctx.logs.push({ provider: "france-validate", ms: 0, ok: false, notes: "invalid SIRET checksum" });
      }

      const [pappers, gouv] = await Promise.all([
        pappersFetch(`https://api.pappers.fr/v2/entreprise?siren=${siren}`, ctx).then((d) => d ? normalizePappers(d) : null),
        rechercheBySiren(siren, ctx),
      ]);

      const winner = [pappers, gouv].sort((a, b) => rankFrCompany(b) - rankFrCompany(a))[0] ?? null;
      return { result: winner, candidates: [] };
    }

    // Name search — parallel, dedup by SIREN
    if (ctx.kind === "name") {
      const [pap, gouv] = await Promise.all([
        (async () => {
          const data = await pappersFetch(`https://api.pappers.fr/v2/recherche?q=${encodeURIComponent(q)}&par_page=8`, ctx);
          return ((data?.resultats ?? []) as any[]).map(normalizePappers);
        })(),
        rechercheByName(q, ctx),
      ]);

      const seen = new Set<string>();
      const merged: NormalizedCompany[] = [];
      for (const c of [...pap, ...gouv]) {
        const k = c.siren ?? c.tax_id ?? `${c.company_name}|${c.address?.postal_code ?? ""}`;
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push(c);
      }
      merged.sort((a, b) => rankFrCompany(b) - rankFrCompany(a));
      return { result: merged.length === 1 ? merged[0] : null, candidates: merged };
    }

    return { result: null, candidates: [] };
  },
};

// ────────────────────────────────────────────────────────────────────
// EUROPE — VIES (VAT validation only)
// ────────────────────────────────────────────────────────────────────
export const europeVatProvider = {
  async validate(vat: string, ctx: Ctx): Promise<{ company: NormalizedCompany | null; vies: { valid: boolean; name?: string; address?: string; country?: string } | null }> {
    const m = vat.replace(/\s/g, "").toUpperCase().match(/^([A-Z]{2})(.+)$/);
    if (!m) return { company: null, vies: null };
    const country = m[1] === "EL" ? "GR" : m[1];
    const number = m[2];

    const data = await timed("europe-vies", async () => {
      const r = await fetchWithTimeout(
        `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${country}/vat/${encodeURIComponent(number)}`,
        undefined, 7000,
      );
      if (!r.ok) return null;
      return await r.json();
    }, ctx);

    if (!data) return { company: null, vies: null };
    const vies = { valid: !!data.isValid, name: data.name ?? undefined, address: data.address ?? undefined, country };
    if (!vies.valid) return { company: null, vies };

    const c = emptyCompany("europe-vies");
    c.country = country;
    c.vat_number = `${country}${number}`;
    c.company_name = vies.name ?? null;
    c.legal_name = vies.name ?? null;
    c.company_status = "active";
    const parsed = parseAddressIntelligent(vies.address ?? null, country);
    c.address = {
      street: parsed.street, street_number: parsed.street_number,
      postal_code: parsed.postal_code, city: parsed.city,
      state: parsed.state, country: parsed.country,
    };
    c.address_line = vies.address ?? joinAddress(c.address);
    c.confidence = vies.name ? "partially_enriched" : "validated";
    return { company: c, vies };
  },
};

// ────────────────────────────────────────────────────────────────────
// BRAZIL — BrasilAPI
// ────────────────────────────────────────────────────────────────────
export const brazilProvider = {
  async lookup(ctx: Ctx): Promise<NormalizedCompany | null> {
    if (ctx.kind !== "cnpj") return null;
    const cnpj = ctx.query.replace(/\D/g, "");
    return await timed("brazil-brasilapi", async () => {
      const r = await fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, undefined, 7000);
      if (!r.ok) return null;
      const d = await r.json();
      const c = emptyCompany("brazil-brasilapi");
      c.country = "BR";
      c.tax_id = cnpj;
      c.company_name = d.nome_fantasia || d.razao_social || null;
      c.legal_name = d.razao_social ?? null;
      c.legal_form = d.natureza_juridica ?? null;
      c.creation_date = d.data_inicio_atividade ?? null;
      c.company_status = d.descricao_situacao_cadastral?.toLowerCase().includes("ativa") ? "active" : (d.descricao_situacao_cadastral ?? "unknown");
      c.address = {
        street: d.logradouro ?? null,
        street_number: d.numero ?? null,
        postal_code: d.cep ?? null,
        city: d.municipio ?? null,
        state: d.uf ?? null,
        country: "Brazil",
      };
      c.address_line = joinAddress(c.address);
      c.confidence = "fully_enriched";
      return c;
    }, ctx);
  },
};

// ────────────────────────────────────────────────────────────────────
// Structural validators (USA / CA / MX / IN / JP)
// ────────────────────────────────────────────────────────────────────
function structural(provider: string, country: string, kind: string, taxId: string): NormalizedCompany {
  const c = emptyCompany(provider);
  c.country = country; c.tax_id = taxId; c.company_status = "unknown";
  c.confidence = "validated"; c.legal_form = kind;
  return c;
}
export const usaProvider     = { async lookup(ctx: Ctx) { return ctx.kind === "ein"     ? structural("usa-structural",   "US", "EIN",            ctx.query.trim()) : null; } };
export const canadaProvider  = { async lookup(ctx: Ctx) { return ctx.kind === "bn_ca"   ? structural("canada-structural","CA", "BN",             ctx.query.trim()) : null; } };
export const mexicoProvider  = { async lookup(ctx: Ctx) { return ctx.kind === "rfc_mx"  ? structural("mexico-structural","MX", "RFC",            ctx.query.trim().toUpperCase()) : null; } };
export const indiaProvider   = { async lookup(ctx: Ctx) { return ctx.kind === "gstin"   ? structural("india-structural", "IN", "GSTIN",          ctx.query.trim().toUpperCase()) : null; } };
export const japanProvider   = { async lookup(ctx: Ctx) { return ctx.kind === "corp_jp" ? structural("japan-structural", "JP", "CorporateNumber",ctx.query.replace(/\D/g, "")) : null; } };

export const genericProvider = {
  lookup(ctx: Ctx): NormalizedCompany | null {
    if (ctx.kind !== "name") return null;
    const c = emptyCompany("generic");
    c.company_name = ctx.query.trim();
    c.confidence = "unverified";
    return c;
  },
};
