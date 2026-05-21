/**
 * European VAT engine — pure functions, zero side effects.
 * Supports: with_vat (FR 20% default), no_vat, reverse_charge (intra-EU B2B).
 */

export type VatMode = "with_vat" | "no_vat" | "reverse_charge";

export interface VatComputation {
  mode: VatMode;
  rate: number; // 0..1
  subtotal: number;
  vatAmount: number;
  total: number;
  legalNote?: string;
}

const COUNTRY_RATES: Record<string, number> = {
  FR: 0.20, DE: 0.19, ES: 0.21, IT: 0.22, PT: 0.23, BE: 0.21, NL: 0.21,
  LU: 0.17, IE: 0.23, AT: 0.20, FI: 0.24, GR: 0.24, PL: 0.23,
};

export function defaultVatRate(country?: string | null): number {
  if (!country) return 0.20;
  return COUNTRY_RATES[country.toUpperCase()] ?? 0.20;
}

export function computeVat(
  subtotal: number,
  mode: VatMode,
  country?: string | null,
): VatComputation {
  const sub = Number(subtotal) || 0;
  if (mode === "no_vat") {
    return { mode, rate: 0, subtotal: sub, vatAmount: 0, total: sub };
  }
  if (mode === "reverse_charge") {
    return {
      mode,
      rate: 0,
      subtotal: sub,
      vatAmount: 0,
      total: sub,
      legalNote:
        "Reverse charge — Article 196 of EU VAT Directive 2006/112/EC. VAT to be accounted for by the recipient.",
    };
  }
  const rate = defaultVatRate(country);
  const vatAmount = Math.round(sub * rate * 100) / 100;
  return { mode, rate, subtotal: sub, vatAmount, total: sub + vatAmount };
}

export function formatVatLabel(mode: VatMode): string {
  return mode === "with_vat" ? "TVA" : mode === "no_vat" ? "Sem TVA" : "Reverse charge (UE)";
}
