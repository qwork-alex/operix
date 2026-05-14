// Germany — Tier B.
// Identifiers:
//   - USt-IdNr (DE + 9 digits) — enrichable via VIES when ENABLE_DE_PROVIDER.
//   - HRB / HRA (Handelsregister) — structural only (no free public API).
//   - Steuernummer — varies by Bundesland; structural only.
import { emptyCompany, fetchWithTimeout, type NormalizedCompany } from "../../core.ts";
import { parseAddressIntelligent } from "../../parsers/address-parser.ts";
import type { CountryCtx, CountryDetection, CountryModule } from "../types.ts";
import { isProviderEnabled } from "../flags.ts";

const RX_HR     = /^(HRA|HRB|GnR|PR|VR)\s*\d{1,7}([\s-][A-Z])?$/i;
const RX_USTID  = /^DE\d{9}$/i;

async function viesEnrichDe(vat: string): Promise<{ name?: string; address?: string } | null> {
  try {
    const number = vat.replace(/^DE/i, "");
    const r = await fetchWithTimeout(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/DE/vat/${encodeURIComponent(number)}`,
      undefined, 6000,
    );
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.isValid) return null;
    return { name: d.name, address: d.address };
  } catch { return null; }
}

export const deModule: CountryModule = {
  iso2: "DE",
  name: "Germany",
  detect(raw) {
    const v = (raw ?? "").trim();
    const out: CountryDetection[] = [];
    if (RX_HR.test(v))     out.push({ kind: "hrb_de",  country: "DE", score: 0.9,  reasons: ["Handelsregister format"] });
    if (RX_USTID.test(v))  out.push({ kind: "ustid_de",country: "DE", score: 0.95, reasons: ["USt-IdNr DE+9 digits"] });
    return out;
  },
  async lookup(ctx: CountryCtx): Promise<NormalizedCompany | null> {
    if (ctx.detected_kind !== "hrb_de" && ctx.detected_kind !== "ustid_de") return null;
    const c = emptyCompany("germany-structural");
    c.country = "DE";
    c.tax_id = ctx.query.trim().toUpperCase();
    c.legal_form = ctx.detected_kind === "hrb_de" ? "Handelsregister" : "USt-IdNr";
    c.company_status = "unknown";
    c.confidence = "validated";

    if (ctx.detected_kind === "ustid_de") c.vat_number = c.tax_id;

    // Optional VIES enrichment for USt-IdNr.
    if (ctx.detected_kind === "ustid_de" && isProviderEnabled("DE")) {
      const t0 = Date.now();
      const vies = await viesEnrichDe(c.tax_id);
      ctx.logs.push({ provider: "germany-vies", ms: Date.now() - t0, ok: !!vies });
      if (vies?.name) {
        c.provider = "germany-vies";
        c.company_name = vies.name;
        c.legal_name = vies.name;
        c.confidence = "partially_enriched";
        if (vies.address) {
          const parsed = parseAddressIntelligent(vies.address, "DE");
          c.address = {
            street: parsed.street, street_number: parsed.street_number,
            postal_code: parsed.postal_code, city: parsed.city,
            state: parsed.state, country: parsed.country ?? "Germany",
          };
          c.address_line = vies.address;
        }
        return c;
      }
    }

    ctx.logs.push({ provider: "germany-structural", ms: 0, ok: true, notes: "structural validation only" });
    return c;
  },
};
