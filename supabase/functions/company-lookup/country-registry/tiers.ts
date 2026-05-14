// Support tier matrix per country.
// TIER_A — full enrichment via official registries (frozen, do not modify).
// TIER_B — partial enrichment (VAT validation + limited registry data).
// TIER_C — structural validation only (format/checksum).
//
// This file is metadata-only. It MUST NOT influence the providers of frozen
// jurisdictions (FR/PT/BE/NL/IT/BR). It exists to drive UI messaging and
// to let the orchestrator emit accurate "documento válido / enrichment limitado"
// statuses instead of misleading "sem correspondência" errors.

export type SupportTier = "A" | "B" | "C" | "unknown";

export const COUNTRY_TIER: Record<string, SupportTier> = {
  // Tier A — frozen. Full enrichment.
  FR: "A", PT: "A", BE: "A", NL: "A", IT: "A",
  BR: "A",
  // Tier B — partial enrichment.
  ES: "B", DE: "B", CH: "B", GB: "B",
  // Tier C — structural only.
  US: "C", IN: "C", CN: "C", MX: "C", JP: "C", CA: "C",
};

export const TIER_LABEL_PT: Record<SupportTier, string> = {
  A: "Enriquecimento completo",
  B: "Enriquecimento parcial",
  C: "Validação estrutural",
  unknown: "Suporte limitado",
};

export function tierFor(country: string | null | undefined): SupportTier {
  if (!country) return "unknown";
  return COUNTRY_TIER[country.toUpperCase()] ?? "unknown";
}
