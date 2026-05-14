// Decoupled providers — each exports a `lookup(query, ctx)` function.
// Providers normalize their upstream payload to NormalizedCompany via core helpers.
import {
  type NormalizedCompany, type DocumentKind, type ProviderLog,
  emptyCompany, fetchWithTimeout, parseAddress, joinAddress, vatFromSiren,
} from "./core.ts";

interface Ctx {
  query: string;
  kind: DocumentKind;
  country: string | null;
  logs: ProviderLog[];
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
// FRANCE — Pappers
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

export const franceProvider = {
  async lookup(ctx: Ctx): Promise<{ result: NormalizedCompany | null; candidates: NormalizedCompany[] }> {
    const key = Deno.env.get("PAPPERS_API_KEY");
    if (!key) return { result: null, candidates: [] };
    const q = ctx.query.trim();

    if (ctx.kind === "siren" || ctx.kind === "siret") {
      const param = ctx.kind === "siren" ? "siren" : "siret";
      const id = q.replace(/\D/g, "");
      const r = await timed("france-pappers", async () => {
        const resp = await fetchWithTimeout(`https://api.pappers.fr/v2/entreprise?${param}=${id}&api_token=${key}`);
        if (!resp.ok) return null;
        return normalizePappers(await resp.json());
      }, ctx);
      return { result: r, candidates: [] };
    }

    if (ctx.kind === "vat_eu" && q.toUpperCase().startsWith("FR")) {
      const siren = q.replace(/\s/g, "").slice(4);
      if (/^\d{9}$/.test(siren)) {
        const r = await timed("france-pappers", async () => {
          const resp = await fetchWithTimeout(`https://api.pappers.fr/v2/entreprise?siren=${siren}&api_token=${key}`);
          if (!resp.ok) return null;
          return normalizePappers(await resp.json());
        }, ctx);
        if (r) return { result: r, candidates: [] };
      }
    }

    if (ctx.kind === "name") {
      const list = await timed("france-pappers", async () => {
        const resp = await fetchWithTimeout(`https://api.pappers.fr/v2/recherche?q=${encodeURIComponent(q)}&api_token=${key}&par_page=8`);
        if (!resp.ok) return [];
        const data = await resp.json();
        return (data?.resultats ?? []).map((x: any) => normalizePappers(x));
      }, ctx);
      const candidates = list ?? [];
      return { result: candidates.length === 1 ? candidates[0] : null, candidates };
    }

    return { result: null, candidates: [] };
  },
};

// ────────────────────────────────────────────────────────────────────
// EUROPE — VIES (VAT validation)
// ────────────────────────────────────────────────────────────────────
export const europeVatProvider = {
  async validate(vat: string, ctx: Ctx): Promise<{ company: NormalizedCompany | null; vies: { valid: boolean; name?: string; address?: string } | null }> {
    const m = vat.replace(/\s/g, "").toUpperCase().match(/^([A-Z]{2})(.+)$/);
    if (!m) return { company: null, vies: null };
    const country = m[1] === "EL" ? "GR" : m[1];
    const number = m[2];

    const data = await timed("europe-vies", async () => {
      const r = await fetchWithTimeout(
        `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${country}/vat/${encodeURIComponent(number)}`,
      );
      if (!r.ok) return null;
      return await r.json();
    }, ctx);

    if (!data) return { company: null, vies: null };
    const vies = { valid: !!data.isValid, name: data.name ?? undefined, address: data.address ?? undefined };
    if (!vies.valid) return { company: null, vies };

    const c = emptyCompany("europe-vies");
    c.country = country;
    c.vat_number = `${country}${number}`;
    c.company_name = vies.name ?? null;
    c.legal_name = vies.name ?? null;
    c.company_status = "active";
    c.address = parseAddress(vies.address ?? null, country);
    c.address_line = vies.address ?? joinAddress(c.address);
    c.confidence = vies.name ? "partially_enriched" : "validated";
    return { company: c, vies };
  },
};

// ────────────────────────────────────────────────────────────────────
// BRAZIL — BrasilAPI (public, no key)
// ────────────────────────────────────────────────────────────────────
export const brazilProvider = {
  async lookup(ctx: Ctx): Promise<NormalizedCompany | null> {
    if (ctx.kind !== "cnpj") return null;
    const cnpj = ctx.query.replace(/\D/g, "");
    return await timed("brazil-brasilapi", async () => {
      const r = await fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
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
// USA / CANADA / MEXICO / INDIA / JAPAN — structural validators (no free public registry).
// Each returns an "unverified" or "validated" stub; ready for upgrade when an API key is added.
// ────────────────────────────────────────────────────────────────────
function structural(provider: string, country: string, kind: string, taxId: string): NormalizedCompany {
  const c = emptyCompany(provider);
  c.country = country;
  c.tax_id = taxId;
  c.company_status = "unknown";
  c.confidence = "validated";
  c.legal_form = kind;
  return c;
}

export const usaProvider = {
  async lookup(ctx: Ctx) {
    if (ctx.kind !== "ein") return null;
    return structural("usa-structural", "US", "EIN", ctx.query.trim());
  },
};
export const canadaProvider = {
  async lookup(ctx: Ctx) {
    if (ctx.kind !== "bn_ca") return null;
    return structural("canada-structural", "CA", "BN", ctx.query.trim());
  },
};
export const mexicoProvider = {
  async lookup(ctx: Ctx) {
    if (ctx.kind !== "rfc_mx") return null;
    return structural("mexico-structural", "MX", "RFC", ctx.query.trim().toUpperCase());
  },
};
export const indiaProvider = {
  async lookup(ctx: Ctx) {
    if (ctx.kind !== "gstin") return null;
    return structural("india-structural", "IN", "GSTIN", ctx.query.trim().toUpperCase());
  },
};
export const japanProvider = {
  async lookup(ctx: Ctx) {
    if (ctx.kind !== "corp_jp") return null;
    return structural("japan-structural", "JP", "CorporateNumber", ctx.query.replace(/\D/g, ""));
  },
};

// ────────────────────────────────────────────────────────────────────
// GENERIC — last-resort, returns input as raw name (no enrichment)
// ────────────────────────────────────────────────────────────────────
export const genericProvider = {
  lookup(ctx: Ctx): NormalizedCompany | null {
    if (ctx.kind !== "name") return null;
    const c = emptyCompany("generic");
    c.company_name = ctx.query.trim();
    c.confidence = "unverified";
    return c;
  },
};
