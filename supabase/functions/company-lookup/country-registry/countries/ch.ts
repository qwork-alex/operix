// Switzerland — UID (Unternehmens-Identifikationsnummer): "CHE-XXX.XXX.XXX" + optional MWST/TVA suffix.
// Free public API: https://www.uid.admin.ch/Search.aspx (SOAP) — too heavy for here.
// We rely on structural validation; future: integrate UID REST when SECO publishes a stable JSON endpoint.
import { emptyCompany, type NormalizedCompany } from "../../core.ts";
import type { CountryCtx, CountryDetection, CountryModule } from "../types.ts";

const RX_UID = /^CHE-?\d{3}\.?\d{3}\.?\d{3}(\s?(MWST|TVA|IVA))?$/i;

function uidChecksum(raw: string): boolean {
  const digits = raw.toUpperCase().replace(/[^0-9]/g, "");
  if (digits.length < 9) return false;
  const body = digits.slice(0, 8); const check = +digits[8];
  const w = [5, 4, 3, 2, 7, 6, 5, 4];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += +body[i] * w[i];
  const r = 11 - (sum % 11);
  const expected = r === 11 ? 0 : r === 10 ? -1 : r;
  return expected === check;
}

export const chModule: CountryModule = {
  iso2: "CH",
  name: "Switzerland",
  detect(raw) {
    const v = (raw ?? "").trim();
    const out: CountryDetection[] = [];
    if (RX_UID.test(v)) {
      const score = uidChecksum(v) ? 0.96 : 0.7;
      out.push({ kind: "uid_ch", country: "CH", score, reasons: ["UID format", uidChecksum(v) ? "checksum ok" : "checksum mismatch"] });
    }
    return out;
  },
  async lookup(ctx: CountryCtx): Promise<NormalizedCompany | null> {
    if (ctx.detected_kind !== "uid_ch") return null;
    const c = emptyCompany("swiss-structural");
    c.country = "CH";
    c.tax_id = ctx.query.trim().toUpperCase();
    c.legal_form = "UID";
    c.company_status = "unknown";
    c.confidence = "validated";
    ctx.logs.push({ provider: "swiss-structural", ms: 0, ok: true });
    return c;
  },
};
