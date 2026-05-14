// Service layer for company registry lookups (FR first, EU-ready).
// All network calls go through the `company-lookup` Edge Function — never call
// third-party APIs directly from the browser.
import { supabase } from "@/integrations/supabase/client";

export type CompanyQueryType = "siren" | "siret" | "vat" | "name";

export interface NormalizedCompany {
  company_name: string | null;
  siren: string | null;
  siret: string | null;
  vat_number: string | null;
  legal_form: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  creation_date: string | null;
  company_status: string | null;
  source: string;
}

export interface LookupResponse {
  type: CompanyQueryType;
  result: NormalizedCompany | null;
  candidates: NormalizedCompany[];
  vies: { valid: boolean; name?: string; address?: string } | null;
  provider_available: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function detectQueryType(raw: string): CompanyQueryType {
  const v = (raw ?? "").trim();
  if (!v) return "name";
  const digits = v.replace(/\D/g, "");
  if (/^FR/i.test(v) && digits.length >= 9) return "vat";
  if (/^[A-Z]{2}/i.test(v) && digits.length >= 8) return "vat";
  if (digits.length === 9 && digits === v.replace(/\s/g, "")) return "siren";
  if (digits.length === 14 && digits === v.replace(/\s/g, "")) return "siret";
  if (/^\d+$/.test(digits) && digits.length === 9) return "siren";
  if (/^\d+$/.test(digits) && digits.length === 14) return "siret";
  return "name";
}

export function isValidSiren(v: string): boolean {
  const s = v.replace(/\D/g, "");
  if (s.length !== 9) return false;
  // Luhn
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = parseInt(s[i], 10);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

export function isValidSiret(v: string): boolean {
  const s = v.replace(/\D/g, "");
  if (s.length !== 14) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = parseInt(s[i], 10);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

export function formatSiren(v: string): string {
  const s = v.replace(/\D/g, "").slice(0, 9);
  return s.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1 $2 $3").trim();
}

export function formatSiret(v: string): string {
  const s = v.replace(/\D/g, "").slice(0, 14);
  return s.replace(/(\d{3})(\d{3})(\d{3})(\d{0,5})/, "$1 $2 $3 $4").trim();
}

export function formatVat(v: string): string {
  return v.replace(/\s/g, "").toUpperCase();
}

// ── Main API ───────────────────────────────────────────────────────────────

export async function lookupCompany(query: string): Promise<LookupResponse> {
  const { data, error } = await supabase.functions.invoke("company-lookup", {
    body: { query },
  });
  if (error) throw error;
  return data as LookupResponse;
}

// Debounce helper — UI uses this to throttle keystroke lookups.
export function debounce<T extends (...args: any[]) => any>(fn: T, ms = 400) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Maps a normalized record onto the client form, never overwriting
// user-controlled fields (email, phone, IBAN, BIC, contacts).
export function mergeCompanyIntoForm<F extends Record<string, any>>(form: F, c: NormalizedCompany): F {
  return {
    ...form,
    name: c.company_name || form.name,
    siren: c.siren || form.siren,
    siret: c.siret || form.siret,
    tva_intracom: c.vat_number || form.tva_intracom,
    address: c.address || form.address,
    postal_code: c.postal_code || form.postal_code,
    city: c.city || form.city,
    country: c.country || form.country,
    notes: appendImportNote(form.notes ?? "", c.source),
  };
}

function appendImportNote(existing: string, source: string): string {
  const stamp = new Date().toLocaleString("pt-PT");
  const note = `[${stamp}] Dados importados automaticamente via registro empresarial francês (${source}).`;
  if (existing.includes("Dados importados automaticamente")) return existing;
  return existing ? `${existing}\n${note}` : note;
}
