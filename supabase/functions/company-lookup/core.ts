// business-registry-core
// Shared types, identifier detection, validation, normalization & address parsing.
// Used by all country/region providers.

export type ConfidenceLevel =
  | "validated"           // identifier shape valid, no enrichment yet
  | "partially_enriched"  // some fields filled (e.g. VAT valid via VIES, name only)
  | "fully_enriched"      // full official record returned
  | "unverified";         // only structural detection, nothing confirmed

export type DocumentKind =
  | "siren" | "siret" | "vat_eu"
  | "cnpj" | "ein" | "gstin" | "bn_ca" | "rfc_mx" | "corp_jp"
  | "name" | "unknown";

export interface NormalizedAddress {
  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface NormalizedCompany {
  // Required-ish identity
  country: string | null;        // ISO-2 (FR, BR, US, ...)
  tax_id: string | null;         // National identifier (SIREN, CNPJ, EIN, GSTIN, BN, RFC, JP corp #)
  vat_number: string | null;     // EU/intracom VAT when applicable
  company_name: string | null;
  legal_name: string | null;
  company_status: string | null; // active | ceased | suspended | unknown
  legal_form: string | null;
  creation_date: string | null;

  // Legacy/aux identifiers (kept for FR backward-compat)
  siren: string | null;
  siret: string | null;

  // Structured + flat address
  address: NormalizedAddress;
  address_line: string | null;   // pre-rendered convenience string

  // Provenance
  provider: string;              // e.g. "france-pappers", "europe-vies", "generic"
  confidence: ConfidenceLevel;
}

export interface ProviderLog {
  provider: string;
  ms: number;
  ok: boolean;
  notes?: string;
}

export interface LookupResult {
  detected_kind: DocumentKind;
  detected_country: string | null;
  result: NormalizedCompany | null;
  candidates: NormalizedCompany[];
  vies?: { valid: boolean; name?: string; address?: string } | null;
  logs: ProviderLog[];
  message: string;               // human-readable status (never raw "not found" if partial data exists)
  confidence: ConfidenceLevel;
}

// ── Detection ──────────────────────────────────────────────────────────────

export function detectDocument(raw: string): { kind: DocumentKind; country: string | null } {
  const v = (raw ?? "").trim();
  if (!v) return { kind: "unknown", country: null };
  const upper = v.toUpperCase();
  const digits = v.replace(/\D/g, "");

  // EU VAT (with country prefix)
  if (/^[A-Z]{2}/.test(upper)) {
    const cc = upper.slice(0, 2);
    const EU = ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","EL","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","XI"];
    if (EU.includes(cc) && digits.length >= 7) return { kind: "vat_eu", country: cc === "EL" ? "GR" : cc };
  }

  // Brazil — CNPJ (14 digits but separate from SIRET via formatting / context cues)
  if (/[\.\/-]/.test(v) && digits.length === 14) return { kind: "cnpj", country: "BR" };
  // India GSTIN — 15 chars alphanumeric: 2-digit state + 10 PAN + 1 entity + Z + checksum
  if (/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(upper)) return { kind: "gstin", country: "IN" };
  // USA EIN — 9 digits often formatted ##-#######
  if (/^\d{2}-\d{7}$/.test(v)) return { kind: "ein", country: "US" };
  // Canada BN — 9 digits + RT/RC/RP suffix
  if (/^\d{9}\s?(RT|RC|RP)?\s?\d{0,4}$/i.test(v)) return { kind: "bn_ca", country: "CA" };
  // Mexico RFC — 12 (moral) or 13 (física) alphanumeric
  if (/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(upper)) return { kind: "rfc_mx", country: "MX" };
  // Japan corporate number — 13 digits
  if (digits.length === 13 && digits === v.replace(/\s/g, "")) return { kind: "corp_jp", country: "JP" };

  // France SIREN / SIRET
  if (digits.length === 9 && digits === v.replace(/\s/g, "")) return { kind: "siren", country: "FR" };
  if (digits.length === 14 && digits === v.replace(/\s/g, "")) return { kind: "siret", country: "FR" };

  return { kind: "name", country: null };
}

// ── Validation ─────────────────────────────────────────────────────────────

export function isValidSiren(v: string): boolean {
  const s = v.replace(/\D/g, ""); if (s.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) { let d = +s[i]; if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return sum % 10 === 0;
}
export function isValidSiret(v: string): boolean {
  const s = v.replace(/\D/g, ""); if (s.length !== 14) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) { let d = +s[i]; if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return sum % 10 === 0;
}
export function isValidCnpj(v: string): boolean {
  const s = v.replace(/\D/g, ""); if (s.length !== 14 || /^(\d)\1+$/.test(s)) return false;
  const calc = (base: string) => {
    const w = base.length === 12
      ? [5,4,3,2,9,8,7,6,5,4,3,2]
      : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let sum = 0; for (let i = 0; i < base.length; i++) sum += +base[i] * w[i];
    const r = sum % 11; return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(s.slice(0, 12));
  const d2 = calc(s.slice(0, 12) + d1);
  return d1 === +s[12] && d2 === +s[13];
}
export function isValidEin(v: string): boolean { return /^\d{2}-?\d{7}$/.test(v.trim()); }
export function isValidGstin(v: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v.trim().toUpperCase());
}

// ── FR helpers ─────────────────────────────────────────────────────────────
export function vatFromSiren(siren: string): string {
  const n = BigInt(siren);
  const key = Number((12n + 3n * (n % 97n)) % 97n);
  return `FR${key.toString().padStart(2, "0")}${siren}`;
}

// ── Address parser ────────────────────────────────────────────────────────
// Best-effort splitter for human-typed single-line addresses.
// Recognizes patterns like:
//   "12 Rue de la Paix, 75002 Paris, France"
//   "Av Paulista 1500, 01310-100, São Paulo - SP, Brazil"
//   "350 Fifth Avenue, New York, NY 10118, USA"
const POSTAL_RX = /\b([A-Z]{0,2}-?\d{4,5}(?:-\d{3})?)\b/i;

export function parseAddress(line: string | null | undefined, fallbackCountry: string | null = null): NormalizedAddress {
  const empty: NormalizedAddress = {
    street: null, street_number: null, postal_code: null,
    city: null, state: null, country: fallbackCountry,
  };
  if (!line) return empty;
  const parts = line.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return empty;

  const out: NormalizedAddress = { ...empty };

  // Country = last part if it looks like a country name (>3 chars, mostly letters)
  if (parts.length >= 2 && /^[A-Za-zÀ-ÿ\s\.]+$/.test(parts[parts.length - 1])) {
    out.country = parts.pop()!;
  }

  // Find a chunk containing a postal code → city/state/postal
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    const m = p.match(POSTAL_RX);
    if (m) {
      out.postal_code = m[1];
      const rest = p.replace(m[0], "").trim().replace(/^[-–—\s]+|[-–—\s]+$/g, "");
      // Try state extraction (e.g. "São Paulo - SP" or "New York, NY")
      const stateMatch = rest.match(/(.+?)[\s\-]+([A-Z]{2})$/);
      if (stateMatch) { out.city = stateMatch[1].trim() || null; out.state = stateMatch[2]; }
      else if (rest) { out.city = rest; }
      parts.splice(i, 1);
      break;
    }
  }

  // Remaining → street + number
  if (parts.length) {
    const street = parts.join(", ");
    const numMatch = street.match(/^(\d+[A-Za-z]?)\s+(.+)$/) || street.match(/^(.+?)\s+(\d+[A-Za-z]?)$/);
    if (numMatch) {
      const [_, a, b] = numMatch;
      if (/^\d/.test(a)) { out.street_number = a; out.street = b; }
      else { out.street = a; out.street_number = b; }
    } else {
      out.street = street;
    }
  }

  return out;
}

export function joinAddress(a: NormalizedAddress): string | null {
  const line1 = [a.street_number, a.street].filter(Boolean).join(" ");
  const line2 = [a.postal_code, a.city].filter(Boolean).join(" ");
  const tail  = [a.state, a.country].filter(Boolean).join(", ");
  const full  = [line1, line2, tail].filter(Boolean).join(", ");
  return full || null;
}

// ── Normalization helper ──────────────────────────────────────────────────
export function emptyCompany(provider: string): NormalizedCompany {
  return {
    country: null, tax_id: null, vat_number: null,
    company_name: null, legal_name: null, company_status: null,
    legal_form: null, creation_date: null,
    siren: null, siret: null,
    address: { street: null, street_number: null, postal_code: null, city: null, state: null, country: null },
    address_line: null,
    provider, confidence: "unverified",
  };
}

// ── Network helper ────────────────────────────────────────────────────────
export async function fetchWithTimeout(url: string, init?: RequestInit, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}
