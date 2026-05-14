// India — GSTIN (15 chars) + PAN (10 chars) detection. Both structurally validated.
// PAN: 5 letters + 4 digits + 1 letter, with positional rules on the 4th letter.
import { emptyCompany, isValidGstin, type NormalizedCompany } from "../../core.ts";
import type { CountryCtx, CountryDetection, CountryModule } from "../types.ts";

const RX_GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const RX_PAN   = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const inModule: CountryModule = {
  iso2: "IN",
  name: "India",
  detect(raw) {
    const v = (raw ?? "").trim().toUpperCase();
    const out: CountryDetection[] = [];
    if (RX_GSTIN.test(v) && isValidGstin(v)) out.push({ kind: "gstin_in", country: "IN", score: 0.97, reasons: ["GSTIN regex"] });
    if (RX_PAN.test(v))                      out.push({ kind: "pan_in",   country: "IN", score: 0.85, reasons: ["PAN regex"] });
    return out;
  },
  async lookup(ctx: CountryCtx): Promise<NormalizedCompany | null> {
    if (ctx.detected_kind !== "gstin_in" && ctx.detected_kind !== "pan_in") return null;
    const c = emptyCompany("india-structural");
    c.country = "IN"; c.tax_id = ctx.query.trim().toUpperCase();
    c.legal_form = ctx.detected_kind === "gstin_in" ? "GSTIN" : "PAN";
    c.confidence = "validated";
    ctx.logs.push({ provider: "india-structural", ms: 0, ok: true });
    return c;
  },
};
