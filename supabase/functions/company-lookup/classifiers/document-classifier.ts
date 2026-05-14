// Document Classification Engine — score-based, contextual, multi-country.
// Returns ranked candidates instead of stopping at the first match.
import type { DocumentKind } from "../core.ts";

export interface ClassificationCandidate {
  kind: DocumentKind;
  country: string | null;
  score: number;          // 0..1 — format/structural confidence
  reasons: string[];
}

export interface ClassificationResult {
  best: ClassificationCandidate;
  candidates: ClassificationCandidate[];
}

const EU_CC = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","EL","GR","HU","IE","IT","LV",
  "LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","XI",
]);

function push(out: ClassificationCandidate[], c: ClassificationCandidate) {
  if (c.score > 0) out.push(c);
}

// Country preference: FR > EU > rest. Adjust scores accordingly.
function applyContextBoost(
  cands: ClassificationCandidate[],
  countryHint: string | null,
): ClassificationCandidate[] {
  return cands.map((c) => {
    let boost = 0;
    if (countryHint === "FR") {
      if (c.country === "FR") boost = 0.15;
      else if (c.country && EU_CC.has(c.country)) boost = 0.07;
    }
    return { ...c, score: Math.min(1, c.score + boost) };
  }).sort((a, b) => b.score - a.score);
}

export function classifyDocument(
  raw: string,
  countryHint: string | null = "FR",
): ClassificationResult {
  const v = (raw ?? "").trim();
  const out: ClassificationCandidate[] = [];

  if (!v) {
    return { best: { kind: "unknown", country: null, score: 0, reasons: ["empty"] }, candidates: [] };
  }

  const upper = v.toUpperCase();
  const digits = v.replace(/\D/g, "");
  const hasFormatting = /[\.\/\-\s]/.test(v);

  // EU VAT — strict country prefix
  if (/^[A-Z]{2}/.test(upper)) {
    const cc = upper.slice(0, 2);
    if (EU_CC.has(cc) && digits.length >= 7 && digits.length <= 12) {
      push(out, {
        kind: "vat_eu",
        country: cc === "EL" ? "GR" : cc,
        score: 0.95,
        reasons: [`prefix=${cc}`, `digits=${digits.length}`],
      });
    }
  }

  // FR identifiers — strong signal when raw has no formatting characters
  if (digits.length === 9 && digits === v.replace(/\s/g, "")) {
    push(out, { kind: "siren", country: "FR", score: 0.85, reasons: ["9 digits, no separators"] });
  }
  if (digits.length === 14 && digits === v.replace(/\s/g, "")) {
    // SIRET vs CNPJ disambiguation: CNPJ usually arrives formatted (./-)
    push(out, { kind: "siret", country: "FR", score: hasFormatting ? 0.55 : 0.85, reasons: ["14 digits"] });
    push(out, { kind: "cnpj",  country: "BR", score: hasFormatting ? 0.80 : 0.45, reasons: ["14 digits, formatting suggests CNPJ"] });
  } else if (digits.length === 14 && hasFormatting) {
    push(out, { kind: "cnpj", country: "BR", score: 0.9, reasons: ["14 digits with ./-"] });
  }

  // India GSTIN — very specific format
  if (/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(upper)) {
    push(out, { kind: "gstin", country: "IN", score: 0.97, reasons: ["GSTIN regex match"] });
  }

  // USA EIN
  if (/^\d{2}-\d{7}$/.test(v)) {
    push(out, { kind: "ein", country: "US", score: 0.92, reasons: ["EIN ##-#######"] });
  } else if (digits.length === 9 && /^\d{9}$/.test(v) && countryHint === "US") {
    push(out, { kind: "ein", country: "US", score: 0.5, reasons: ["9 digits + US context"] });
  }

  // Canada BN
  if (/^\d{9}\s?(RT|RC|RP)\s?\d{0,4}$/i.test(v)) {
    push(out, { kind: "bn_ca", country: "CA", score: 0.93, reasons: ["BN with program suffix"] });
  }

  // Mexico RFC
  if (/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(upper)) {
    push(out, { kind: "rfc_mx", country: "MX", score: 0.95, reasons: ["RFC pattern"] });
  }

  // Japan corporate number — 13 digits exact
  if (digits.length === 13 && /^\d{13}$/.test(v.replace(/\s/g, ""))) {
    push(out, { kind: "corp_jp", country: "JP", score: 0.85, reasons: ["13 digits"] });
  }

  // Name fallback — anything letter-heavy that didn't match a strong identifier
  const lettersRatio = (v.replace(/[^A-Za-zÀ-ÿ]/g, "").length) / Math.max(v.length, 1);
  if (lettersRatio > 0.4) {
    push(out, { kind: "name", country: null, score: 0.4 + 0.3 * lettersRatio, reasons: [`letters=${lettersRatio.toFixed(2)}`] });
  }

  // Last resort
  if (!out.length) {
    out.push({ kind: "unknown", country: null, score: 0.05, reasons: ["no structural match"] });
  }

  const ranked = applyContextBoost(out, countryHint);
  return { best: ranked[0], candidates: ranked };
}
