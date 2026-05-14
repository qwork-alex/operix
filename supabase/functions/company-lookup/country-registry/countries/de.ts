// Germany — structural validation only (Handelsregister has no public free API).
// Identifiers:
//   - USt-IdNr (DE + 9 digits) — handled via VIES at orchestrator level (vat_eu/DE).
//   - HRB / HRA (Handelsregister) — "HRB 12345" or "HRB 12345 B".
//   - Steuernummer — varies by Bundesland (10-13 digits). Detected loosely, validated structurally.
import { emptyCompany, type NormalizedCompany } from "../../core.ts";
import type { CountryCtx, CountryDetection, CountryModule } from "../types.ts";

const RX_HR     = /^(HRA|HRB|GnR|PR|VR)\s*\d{1,7}([\s-][A-Z])?$/i;
const RX_USTID  = /^DE\d{9}$/i;

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
    // No keyless official API. Return structural-only confirmation; VAT goes through VIES upstream.
    if (ctx.detected_kind === "hrb_de" || ctx.detected_kind === "ustid_de") {
      const c = emptyCompany("germany-structural");
      c.country = "DE";
      c.tax_id = ctx.query.trim().toUpperCase();
      c.legal_form = ctx.detected_kind === "hrb_de" ? "Handelsregister" : "USt-IdNr";
      c.company_status = "unknown";
      c.confidence = "validated";
      ctx.logs.push({ provider: "germany-structural", ms: 0, ok: true, notes: "structural validation only" });
      return c;
    }
    return null;
  },
};
