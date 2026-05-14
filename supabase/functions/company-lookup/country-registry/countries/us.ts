// USA — EIN structural (existing usaProvider also covers this; module re-exposes through registry contract).
import { emptyCompany, isValidEin, type NormalizedCompany } from "../../core.ts";
import type { CountryCtx, CountryDetection, CountryModule } from "../types.ts";

// Strict EIN: require the canonical "##-#######" formatting, otherwise plain 9-digit
// strings collide with FR SIREN. Plain 9-digit only when context_hint=US.
const RX_EIN = /^\d{2}-\d{7}$/;

export const usModule: CountryModule = {
  iso2: "US",
  name: "United States",
  detect(raw) {
    const v = (raw ?? "").trim();
    const out: CountryDetection[] = [];
    if (RX_EIN.test(v) && isValidEin(v)) out.push({ kind: "ein_us", country: "US", score: 0.92, reasons: ["EIN format"] });
    return out;
  },
  async lookup(ctx: CountryCtx): Promise<NormalizedCompany | null> {
    if (ctx.detected_kind !== "ein_us") return null;
    const c = emptyCompany("usa-structural");
    c.country = "US"; c.tax_id = ctx.query.trim();
    c.legal_form = "EIN"; c.confidence = "validated";
    ctx.logs.push({ provider: "usa-structural", ms: 0, ok: true });
    return c;
  },
};
