// Country Capability Matrix — declarative description of what each jurisdiction
// can really do. Drives UI messaging and the orchestrator's status reporting.
// METADATA-ONLY: never used to mutate provider behavior of frozen countries
// (FR/PT/BE/NL/IT/BR remain untouched).
//
// Resolution models (per the architecture brief):
//   A  — VAT-centric        (EU registries connected via VIES; tax-id-first works)
//   B  — Registry-centric   (UK/US/CH/...; lookup primarily by company name in a national registry)
//   C  — Closed/semi-closed (CN/IN/...; specialized providers, partial coverage)
//
// Lookup statuses surfaced to the UI:
//   - invalid_document         → format/checksum failed
//   - provider_unavailable     → country supported but live provider down/missing key
//   - valid_no_enrichment      → document is valid, no enrichment available for this jurisdiction
//   - partial_enrichment       → some fields enriched (e.g. VIES name, no address)
//   - fully_enriched           → registry returned full record
//   - no_match                 → identifier valid format but registry returned no record

export type ResolutionModel = "A" | "B" | "C" | "unknown";

export type LookupStatus =
  | "invalid_document"
  | "provider_unavailable"
  | "valid_no_enrichment"
  | "partial_enrichment"
  | "fully_enriched"
  | "no_match";

export interface CountryCapability {
  iso2: string;
  model: ResolutionModel;
  enrichment: "full" | "partial" | "none";
  validation: boolean;        // structural validation available
  provider: "available" | "limited" | "manual";
  searchByName: boolean;
  searchByTaxId: boolean;
  notes?: string;
}

export const COUNTRY_CAPABILITY: Record<string, CountryCapability> = {
  // ── Model A — VAT-centric, frozen full-enrichment stack ─────────────
  FR: { iso2: "FR", model: "A", enrichment: "full",    validation: true, provider: "available", searchByName: true,  searchByTaxId: true },
  PT: { iso2: "PT", model: "A", enrichment: "full",    validation: true, provider: "available", searchByName: true,  searchByTaxId: true },
  BE: { iso2: "BE", model: "A", enrichment: "full",    validation: true, provider: "available", searchByName: true,  searchByTaxId: true },
  IT: { iso2: "IT", model: "A", enrichment: "full",    validation: true, provider: "available", searchByName: true,  searchByTaxId: true },
  NL: { iso2: "NL", model: "A", enrichment: "full",    validation: true, provider: "available", searchByName: true,  searchByTaxId: true },
  BR: { iso2: "BR", model: "A", enrichment: "full",    validation: true, provider: "available", searchByName: false, searchByTaxId: true },

  // ── Model A — VAT-centric, partial (VIES-only enrichment) ───────────
  ES: { iso2: "ES", model: "A", enrichment: "partial", validation: true, provider: "limited",   searchByName: false, searchByTaxId: true,  notes: "VIES + Registro Mercantil (planeado)" },
  DE: { iso2: "DE", model: "A", enrichment: "partial", validation: true, provider: "limited",   searchByName: false, searchByTaxId: true,  notes: "Handelsregister sem API pública" },

  // ── Model B — Registry-centric ──────────────────────────────────────
  GB: { iso2: "GB", model: "B", enrichment: "full",    validation: true, provider: "available", searchByName: true,  searchByTaxId: true,  notes: "Companies House (chave necessária)" },
  CH: { iso2: "CH", model: "B", enrichment: "partial", validation: true, provider: "limited",   searchByName: true,  searchByTaxId: true,  notes: "ZEFIX / UID — placeholder" },
  US: { iso2: "US", model: "B", enrichment: "partial", validation: true, provider: "limited",   searchByName: true,  searchByTaxId: true,  notes: "SEC / OpenCorporates — placeholder" },

  // ── Model C — Closed / semi-closed ──────────────────────────────────
  IN: { iso2: "IN", model: "C", enrichment: "none",    validation: true, provider: "manual",    searchByName: false, searchByTaxId: true,  notes: "GST/MCA — abstração futura" },
  CN: { iso2: "CN", model: "C", enrichment: "none",    validation: true, provider: "manual",    searchByName: false, searchByTaxId: true,  notes: "Provedor placeholder" },

  // Structural-only utilities
  CA: { iso2: "CA", model: "C", enrichment: "none",    validation: true, provider: "manual",    searchByName: false, searchByTaxId: true },
  MX: { iso2: "MX", model: "C", enrichment: "none",    validation: true, provider: "manual",    searchByName: false, searchByTaxId: true },
  JP: { iso2: "JP", model: "C", enrichment: "none",    validation: true, provider: "manual",    searchByName: false, searchByTaxId: true },
};

export function capabilityFor(country: string | null | undefined): CountryCapability | null {
  if (!country) return null;
  return COUNTRY_CAPABILITY[country.toUpperCase()] ?? null;
}

/** Countries served by the country-specific registry. Used to PREVENT cascade
 *  to legacy/EU-generic providers when the detected country owns the request. */
export const COUNTRY_OWNED = new Set(["GB", "CH", "US", "IN", "CN", "DE", "ES"]);

export function deriveLookupStatus(args: {
  hasResult: boolean;
  isStructuralOnly: boolean;
  hasEnrichmentFields: boolean;
  capability: CountryCapability | null;
  invalidFormat?: boolean;
  providerErrored?: boolean;
}): LookupStatus {
  if (args.invalidFormat) return "invalid_document";
  if (args.providerErrored && args.capability && args.capability.provider !== "manual") return "provider_unavailable";
  if (!args.hasResult) return "no_match";
  if (args.isStructuralOnly && !args.hasEnrichmentFields) return "valid_no_enrichment";
  if (args.hasEnrichmentFields && args.capability?.enrichment === "full" && args.hasResult) {
    // partial vs full inferred at provider level; fall through to caller's signal
  }
  return args.isStructuralOnly ? "valid_no_enrichment"
       : args.hasEnrichmentFields ? "partial_enrichment"
       : "no_match";
}

export const LOOKUP_STATUS_LABEL_PT: Record<LookupStatus, string> = {
  invalid_document:       "Documento inválido",
  provider_unavailable:   "Provedor indisponível",
  valid_no_enrichment:    "Documento válido — sem enriquecimento",
  partial_enrichment:     "Enriquecimento parcial",
  fully_enriched:         "Enriquecimento completo",
  no_match:               "Sem correspondência",
};
