// Address Intelligence Layer — splits a single-line address into structured parts.
// Improvements over the legacy parseAddress:
//  - extracts apartment / floor / suite as `complement`
//  - distinguishes state from country for CA/US/BR/MX patterns
//  - normalizes multiple whitespace and trailing punctuation
import type { NormalizedAddress } from "../core.ts";

const COMPLEMENT_RX = /\b(apt\.?|apto\.?|appartement|suite|ste\.?|floor|piso|étage|étg|sala|room|bloco|bl\.?|edificio|edif\.?)\s*([A-Za-z0-9\-]+)/i;
const POSTAL_RX = /\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|\d{4,5}(?:-\d{3,4})?|[A-Z]\d[A-Z]\s?\d[A-Z]\d)\b/i;
const STATE_2L_RX = /\b([A-Z]{2})\b/;

const COUNTRY_HINTS: Record<string, string> = {
  france: "FR", brasil: "BR", brazil: "BR", portugal: "PT",
  españa: "ES", spain: "ES", italia: "IT", italy: "IT",
  deutschland: "DE", germany: "DE", "united states": "US", usa: "US",
  canada: "CA", mexico: "MX", méxico: "MX", japan: "JP",
};

export interface ParsedAddress extends NormalizedAddress {
  complement: string | null;
  raw: string | null;
  confidence: number; // 0..1
}

export function parseAddressIntelligent(
  line: string | null | undefined,
  fallbackCountry: string | null = null,
): ParsedAddress {
  const out: ParsedAddress = {
    street: null, street_number: null, complement: null,
    postal_code: null, city: null, state: null,
    country: fallbackCountry, raw: line ?? null, confidence: 0,
  };
  if (!line) return out;

  let work = line.replace(/\s+/g, " ").trim();
  let confidence = 0.2;

  // Extract complement first (so it doesn't pollute street)
  const compMatch = work.match(COMPLEMENT_RX);
  if (compMatch) {
    out.complement = `${compMatch[1]} ${compMatch[2]}`.trim();
    work = work.replace(compMatch[0], "").replace(/\s{2,}/g, " ").trim();
    confidence += 0.05;
  }

  const parts = work.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { ...out, confidence };

  // Country = last part if it looks like a country name
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const slug = last.toLowerCase();
    if (COUNTRY_HINTS[slug]) {
      out.country = COUNTRY_HINTS[slug];
      parts.pop();
      confidence += 0.1;
    } else if (/^[A-Za-zÀ-ÿ\s\.]{3,}$/.test(last) && last.split(/\s+/).length <= 3) {
      out.country = last;
      parts.pop();
      confidence += 0.05;
    }
  }

  // Walk backwards to find postal/city/state chunk
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    const m = p.match(POSTAL_RX);
    if (m) {
      out.postal_code = m[1].toUpperCase();
      let rest = p.replace(m[0], "").trim().replace(/^[-–—\s]+|[-–—\s]+$/g, "");
      const stateMatch = rest.match(/(.+?)[\s\-,]+([A-Z]{2})$/) || rest.match(/^([A-Z]{2})\s+(.+)$/);
      if (stateMatch) {
        const a = stateMatch[1], b = stateMatch[2];
        if (/^[A-Z]{2}$/.test(a)) { out.state = a; out.city = b.trim(); }
        else { out.city = a.trim(); out.state = b; }
      } else if (rest) {
        out.city = rest;
      }
      parts.splice(i, 1);
      confidence += 0.25;
      break;
    }
  }

  // If we still have a chunk that looks like "City - ST"
  if (!out.state && parts.length) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const sm = parts[i].match(/(.+?)[\s\-]+([A-Z]{2})$/);
      if (sm) {
        out.city = out.city ?? sm[1].trim();
        out.state = sm[2];
        parts.splice(i, 1);
        confidence += 0.05;
        break;
      }
    }
  }

  // Remaining → street + number
  if (parts.length) {
    const street = parts.join(", ").replace(/\s{2,}/g, " ").trim();
    const numLeading = street.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
    const numTrailing = street.match(/^(.+?)\s+(\d+[A-Za-z]?)$/);
    if (numLeading) {
      out.street_number = numLeading[1];
      out.street = numLeading[2];
      confidence += 0.15;
    } else if (numTrailing) {
      out.street = numTrailing[1];
      out.street_number = numTrailing[2];
      confidence += 0.15;
    } else {
      out.street = street;
      confidence += 0.05;
    }
  }

  // City fallback from last remaining part if no postal seen
  if (!out.city && parts.length) {
    out.city = parts[parts.length - 1];
  }

  out.confidence = Math.min(1, confidence);
  return out;
}

export function joinAddressLine(a: NormalizedAddress, complement?: string | null): string | null {
  const line1 = [a.street_number, a.street].filter(Boolean).join(" ");
  const line1c = complement ? `${line1} (${complement})` : line1;
  const line2 = [a.postal_code, a.city].filter(Boolean).join(" ");
  const tail = [a.state, a.country].filter(Boolean).join(", ");
  return [line1c, line2, tail].filter(Boolean).join(", ") || null;
}
