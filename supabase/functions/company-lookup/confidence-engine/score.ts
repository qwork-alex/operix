// Confidence Engine — aggregates multi-factor scoring into a single decision.
import type { ConfidenceLevel, NormalizedCompany } from "../core.ts";

export interface ConfidenceBreakdown {
  format: number;       // structural / regex confidence (from classifier)
  provider: number;     // upstream data quality
  country: number;      // country resolution (1 if explicit)
  contextual: number;   // bonus for matching country hint
  field_completeness: number; // % of important fields populated
  total: number;        // 0..1
  level: ConfidenceLevel;
  auto_apply: boolean;  // true only if total >= AUTO_APPLY_THRESHOLD
}

export const AUTO_APPLY_THRESHOLD = 0.85;

const PROVIDER_WEIGHTS: Record<string, number> = {
  "france-pappers":               0.95,
  "france-recherche-entreprises": 0.92,
  "brazil-brasilapi":             0.95,
  "europe-vies":                  0.65,
  "usa-structural":    0.35,
  "canada-structural": 0.35,
  "mexico-structural": 0.35,
  "india-structural":  0.35,
  "japan-structural":  0.35,
  "generic":           0.1,
};

function fieldCompleteness(c: NormalizedCompany): number {
  const fields = [
    c.company_name, c.tax_id || c.siren || c.siret, c.vat_number,
    c.address?.street, c.address?.city, c.address?.postal_code, c.address?.country,
    c.legal_form, c.creation_date,
  ];
  const filled = fields.filter((x) => x != null && String(x).trim() !== "").length;
  return filled / fields.length;
}

export function scoreCompany(opts: {
  company: NormalizedCompany | null;
  formatScore: number;
  countryHint: string | null;
}): ConfidenceBreakdown {
  const { company, formatScore, countryHint } = opts;
  if (!company) {
    return {
      format: formatScore, provider: 0, country: 0, contextual: 0,
      field_completeness: 0, total: 0, level: "unverified", auto_apply: false,
    };
  }

  const provider = PROVIDER_WEIGHTS[company.provider] ?? 0.3;
  const country = company.country ? 1 : 0.3;
  const contextual = countryHint && company.country === countryHint ? 1 : 0.5;
  const completeness = fieldCompleteness(company);

  // Weighted total
  const total =
    formatScore   * 0.20 +
    provider      * 0.30 +
    country       * 0.10 +
    contextual    * 0.10 +
    completeness  * 0.30;

  let level: ConfidenceLevel;
  if (total >= 0.85) level = "fully_enriched";
  else if (total >= 0.6) level = "partially_enriched";
  else if (total >= 0.4) level = "validated";
  else level = "unverified";

  return {
    format: formatScore, provider, country, contextual,
    field_completeness: completeness, total: Math.round(total * 100) / 100,
    level, auto_apply: total >= AUTO_APPLY_THRESHOLD,
  };
}
