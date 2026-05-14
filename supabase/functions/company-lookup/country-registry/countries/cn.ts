// China — Unified Social Credit Code (统一社会信用代码, USCC): 18 chars.
// Format: [1 reg authority][1 category][6 region][9 org code][1 checksum]. Alphanumeric, excludes I,O,Z,S,V.
import { emptyCompany, type NormalizedCompany } from "../../core.ts";
import type { CountryCtx, CountryDetection, CountryModule } from "../types.ts";

const RX_USCC = /^[0-9A-HJ-NPQRTUWXY]{18}$/;
const ALPHABET = "0123456789ABCDEFGHJKLMNPQRTUWXY"; // 31 chars, excluding I,O,S,V,Z
const WEIGHTS = [1,3,9,27,19,26,16,17,20,29,25,13,8,24,10,30,28];

function usccChecksum(code: string): boolean {
  if (!RX_USCC.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const idx = ALPHABET.indexOf(code[i]);
    if (idx < 0) return false;
    sum += idx * WEIGHTS[i];
  }
  const remainder = sum % 31;
  const expected = (31 - remainder) % 31;
  const expectedChar = ALPHABET[expected];
  return expectedChar === code[17];
}

export const cnModule: CountryModule = {
  iso2: "CN",
  name: "China",
  detect(raw) {
    const v = (raw ?? "").trim().toUpperCase();
    const out: CountryDetection[] = [];
    if (RX_USCC.test(v)) {
      const ok = usccChecksum(v);
      out.push({ kind: "uscc_cn", country: "CN", score: ok ? 0.96 : 0.6, reasons: ["USCC format", ok ? "checksum ok" : "checksum mismatch"] });
    }
    return out;
  },
  async lookup(ctx: CountryCtx): Promise<NormalizedCompany | null> {
    if (ctx.detected_kind !== "uscc_cn") return null;
    const c = emptyCompany("china-structural");
    c.country = "CN"; c.tax_id = ctx.query.trim().toUpperCase();
    c.legal_form = "USCC"; c.confidence = "validated";
    ctx.logs.push({ provider: "china-structural", ms: 0, ok: true });
    return c;
  },
};
