// Country registry — central index of all per-jurisdiction modules.
// Strict isolation: each module owns its detection + lookup. No cross-talk.
// Frozen countries (FR/PT/BE/NL/IT/BR) are NOT routed here — they continue
// to be served by the legacy provider stack to preserve behavior.
import type { CountryModule, CountryDetection, CountryCtx } from "./types.ts";
import { isEnabled } from "./flags.ts";
import { deModule } from "./countries/de.ts";
import { esModule } from "./countries/es.ts";
import { chModule } from "./countries/ch.ts";
import { gbModule } from "./countries/gb.ts";
import { usModule } from "./countries/us.ts";
import { inModule } from "./countries/in.ts";
import { cnModule } from "./countries/cn.ts";

// New countries served by the modular registry (priority order).
const NEW_MODULES: CountryModule[] = [deModule, esModule, chModule, gbModule, usModule, inModule, cnModule];

const BY_ISO: Record<string, CountryModule> = Object.fromEntries(
  NEW_MODULES.map((m) => [m.iso2, m]),
);

export function listEnabledModules(): CountryModule[] {
  return NEW_MODULES.filter((m) => isEnabled(m.iso2));
}

/** Pure detection across all enabled new-country modules. Returns ranked candidates. */
export function detectAcrossRegistry(raw: string): CountryDetection[] {
  const out: CountryDetection[] = [];
  for (const m of listEnabledModules()) {
    for (const d of m.detect(raw)) out.push(d);
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Resolve an ISO-2 country to its module, gated by the feature flag. */
export function resolveModule(iso2: string | null | undefined): CountryModule | null {
  if (!iso2 || !isEnabled(iso2)) return null;
  return BY_ISO[iso2] ?? null;
}

export type { CountryCtx, CountryDetection, CountryModule };
