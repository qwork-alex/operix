// Spain — NIF (personas) / CIF (sociedades) / NIE (extranjeros). VAT = ES + NIF/CIF.
// Structural validation with checksum where stable.
import { emptyCompany, type NormalizedCompany } from "../../core.ts";
import type { CountryCtx, CountryDetection, CountryModule } from "../types.ts";

// CIF: [ABCDEFGHJNPQRSUVW] + 7 digits + control (digit or letter).
const RX_CIF = /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/i;
// NIF persona física: 8 digits + letter.
const RX_NIF = /^\d{8}[A-Z]$/i;
// NIE: [XYZ] + 7 digits + letter.
const RX_NIE = /^[XYZ]\d{7}[A-Z]$/i;

const NIF_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

function nifChecksum(value: string): boolean {
  const v = value.toUpperCase();
  let num = v.slice(0, 8);
  if (/^[XYZ]/.test(v)) num = ({ X: "0", Y: "1", Z: "2" }[v[0] as "X"|"Y"|"Z"]) + v.slice(1, 8);
  if (!/^\d{8}$/.test(num)) return false;
  return NIF_LETTERS[parseInt(num, 10) % 23] === v[v.length - 1];
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
    const c = emptyCompany("spain-structural");
    c.country = "ES";
    c.tax_id = ctx.query.trim().toUpperCase();
    c.legal_form = ctx.detected_kind === "cif_es" ? "Sociedad" : "Persona";
    c.vat_number = `ES${c.tax_id}`;
    c.company_status = "unknown";
    c.confidence = "validated";
    ctx.logs.push({ provider: "spain-structural", ms: 0, ok: true });
    return c;
  },
};
