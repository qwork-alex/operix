// United Kingdom — Companies House (free public API, requires API key).
// Identifier: 8-char company number (digits, or 2 letters + 6 digits, e.g. "SC123456", "NI012345", "12345678").
import { emptyCompany, fetchWithTimeout, joinAddress, type NormalizedCompany } from "../../core.ts";
import { parseAddressIntelligent } from "../../parsers/address-parser.ts";
import type { CountryCtx, CountryDetection, CountryModule } from "../types.ts";

const RX_CRN = /^([A-Z]{2}\d{6}|\d{8})$/i;

export const gbModule: CountryModule = {
  iso2: "GB",
  name: "United Kingdom",
  detect(raw) {
    const v = (raw ?? "").trim().toUpperCase();
    const out: CountryDetection[] = [];
    if (RX_CRN.test(v)) out.push({ kind: "crn_uk", country: "GB", score: 0.88, reasons: ["Companies House CRN format"] });
    return out;
  },
  async lookup(ctx: CountryCtx): Promise<NormalizedCompany | null> {
    if (ctx.detected_kind !== "crn_uk") return null;
    const key = Deno.env.get("COMPANIES_HOUSE_API_KEY");
    if (!key) {
      // No key → structural-only.
      const c = emptyCompany("uk-structural");
      c.country = "GB"; c.tax_id = ctx.query.trim().toUpperCase();
      c.legal_form = "Companies House"; c.confidence = "validated";
      ctx.logs.push({ provider: "uk-structural", ms: 0, ok: true, notes: "no api key — structural" });
      return c;
    }
    const t0 = Date.now();
    try {
      const auth = "Basic " + btoa(`${key}:`);
      const r = await fetchWithTimeout(
        `https://api.company-information.service.gov.uk/company/${encodeURIComponent(ctx.query.trim())}`,
        { headers: { Authorization: auth, Accept: "application/json" } }, 7000,
      );
      if (!r.ok) { ctx.logs.push({ provider: "uk-companies-house", ms: Date.now() - t0, ok: false, notes: `HTTP ${r.status}` }); return null; }
      const d = await r.json();
      const c = emptyCompany("uk-companies-house");
      c.country = "GB";
      c.tax_id = d.company_number ?? ctx.query.trim().toUpperCase();
      c.company_name = d.company_name ?? null;
      c.legal_name = d.company_name ?? null;
      c.legal_form = d.type ?? null;
      c.creation_date = d.date_of_creation ?? null;
      c.company_status = d.company_status ?? "unknown";
      const a = d.registered_office_address ?? {};
      c.address = {
        street: [a.address_line_1, a.address_line_2].filter(Boolean).join(", ") || null,
        street_number: null,
        postal_code: a.postal_code ?? null,
        city: a.locality ?? null,
        state: a.region ?? null,
        country: a.country ?? "United Kingdom",
      };
      c.address_line = joinAddress(c.address);
      if (!c.address.street && a.premises) {
        const parsed = parseAddressIntelligent(`${a.premises} ${a.address_line_1 ?? ""}`, "GB");
        c.address.street = parsed.street; c.address.street_number = parsed.street_number;
      }
      c.confidence = "fully_enriched";
      ctx.logs.push({ provider: "uk-companies-house", ms: Date.now() - t0, ok: true });
      return c;
    } catch (e) {
      ctx.logs.push({ provider: "uk-companies-house", ms: Date.now() - t0, ok: false, notes: String((e as any)?.message ?? e) });
      return null;
    }
  },
};
