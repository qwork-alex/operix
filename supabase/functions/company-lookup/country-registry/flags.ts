// Feature flags per country. Driven by env so we can dark-launch jurisdictions
// without code changes. Defaults are conservative: existing stable countries ON,
// new countries ON for structural detection but provider calls are gated by key
// availability inside each module.
//
// FROZEN (do not touch logic): FR, PT, BE, NL, IT, BR
// NEW priority list:           DE, ES, CH, GB, US, IN, CN

export type CountryISO2 =
  | "FR" | "PT" | "BE" | "NL" | "IT" | "BR"
  | "DE" | "ES" | "CH" | "GB" | "US" | "IN" | "CN";

const ENV = (k: string) => Deno.env.get(k);

function flag(name: string, fallback: boolean): boolean {
  const v = ENV(name);
  if (v == null) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

export const COUNTRY_ENABLED: Record<CountryISO2, boolean> = {
  // Frozen — never disabled here.
  FR: true, PT: true, BE: true, NL: true, IT: true, BR: true,
  // New jurisdictions — toggleable.
  DE: flag("COUNTRY_DE_ENABLED", true),
  ES: flag("COUNTRY_ES_ENABLED", true),
  CH: flag("COUNTRY_CH_ENABLED", true),
  GB: flag("COUNTRY_GB_ENABLED", true),
  US: flag("COUNTRY_US_ENABLED", true),
  IN: flag("COUNTRY_IN_ENABLED", true),
  CN: flag("COUNTRY_CN_ENABLED", true),
};

export function isEnabled(iso2: string): boolean {
  return COUNTRY_ENABLED[iso2 as CountryISO2] === true;
}
