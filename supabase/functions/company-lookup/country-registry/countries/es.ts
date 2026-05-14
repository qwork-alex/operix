// Spain — NIF (personas) / CIF (sociedades) / NIE (extranjeros). VAT = ES + NIF/CIF.
// Tier B: structural validation (always) + optional VIES enrichment for the company name.
import { emptyCompany, fetchWithTimeout, type NormalizedCompany } from "../../core.ts";
import { parseAddressIntelligent } from "../../parsers/address-parser.ts";
import type { CountryCtx, CountryDetection, CountryModule } from "../types.ts";
import { isProviderEnabled } from "../flags.ts";

const RX_CIF = /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/i;
const RX_NIF = /^\d{8}[A-Z]$/i;
const RX_NIE = /^[XYZ]\d{7}[A-Z]$/i;

const NIF_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
function nifChecksum(value: string): boolean {
  const v = value.toUpperCase();
  let num = v.slice(0, 8);
  if (/^[XYZ]/.test(v)) num = ({ X: "0", Y: "1", Z: "2" }[v[0] as "X"|"Y"|"Z"]) + v.slice(1, 8);
  if (!/^\d{8}$/.test(num)) return false;
  return NIF_LETTERS[parseInt(num, 10) % 23] === v[v.length - 1];
}

async function viesEnrich(taxId: string): Promise<{ name?: string; address?: string } | null> {
  try {
    const r = await fetchWithTimeout(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/ES/vat/${encodeURIComponent(taxId)}`,
      undefined, 6000,
    );
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.isValid) return null;
    return { name: d.name, address: d.address };
  } catch { return null; }
}

export const esModule: CountryModule = {
  iso2: "ES",
  name: "Spain",
  detect(raw) {
    const v = (raw ?? "").trim().toUpperCase();
    const out: CountryDetection[] = [];
    if (RX_CIF.test(v)) out.push({ kind: "cif_es", country: "ES", score: 0.93, reasons: ["CIF pattern"] });
    if (RX_NIF.test(v) && nifChecksum(v)) out.push({ kind: "nif_es", country: "ES", score: 0.92, reasons: ["NIF + checksum"] });
    if (RX_NIE.test(v) && nifChecksum(v)) out.push({ kind: "nie_es", country: "ES", score: 0.9,  reasons: ["NIE + checksum"] });
    return out;
  },
  async lookup(ctx: CountryCtx): Promise<NormalizedCompany | null> {
    if (!["cif_es","nif_es","nie_es"].includes(ctx.detected_kind as string)) return null;
    const taxId = ctx.query.trim().toUpperCase();
    const c = emptyCompany("spain-structural");
    c.country = "ES";
    c.tax_id = taxId;
    c.legal_form = ctx.detected_kind === "cif_es" ? "Sociedad" : "Persona";
    c.vat_number = `ES${taxId}`;
    c.company_status = "unknown";
    c.confidence = "validated";
    ctx.logs.push({ provider: "spain-structural", ms: 0, ok: true });

    // Optional VIES enrichment (Tier B). Only for company forms (CIF) where
    // VIES typically returns a registered name. Personas físicas raramente retornam.
    if (isProviderEnabled("ES") && ctx.detected_kind === "cif_es") {
      const t0 = Date.now();
      const vies = await viesEnrich(taxId);
      ctx.logs.push({ provider: "spain-vies", ms: Date.now() - t0, ok: !!vies });
      if (vies?.name) {
        c.provider = "spain-vies";
        c.company_name = vies.name;
        c.legal_name = vies.name;
        c.confidence = "partially_enriched";
        if (vies.address) {
          const parsed = parseAddressIntelligent(vies.address, "ES");
          c.address = {
            street: parsed.street, street_number: parsed.street_number,
            postal_code: parsed.postal_code, city: parsed.city,
            state: parsed.state, country: parsed.country ?? "Spain",
          };
          c.address_line = vies.address;
        }
      }
    }
    return c;
  },
};
