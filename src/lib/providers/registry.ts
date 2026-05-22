/**
 * Generic Provider Registry
 * -------------------------
 * Decouples external integrations (weather, map, AI, geocoding, telemetry)
 * from their consumers. Each domain registers concrete adapters here; the
 * UI/business layer only ever talks to the registry.
 *
 * Design rules:
 *  - No side effects on import (registration happens in each domain module).
 *  - No singletons hidden behind hooks — keep the layer testable.
 *  - Fallback is explicit: caller asks for a capability, registry returns
 *    the highest-priority provider that is enabled AND healthy.
 *  - Health checks are opt-in (provider implements `healthCheck()`).
 */

export type ProviderDomain = "weather" | "map" | "ai" | "geocoding" | "telemetry";

export interface ProviderHealth {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  checkedAt: number;
}

export interface BaseProvider {
  /** Stable unique key inside its domain (e.g. "meteoalarm", "noaa"). */
  key: string;
  /** Human-readable label for logs / UI diagnostics. */
  name: string;
  /** Lower number = higher priority when resolving fallbacks. */
  priority: number;
  /** Capability tags the consumer can filter by (free-form per domain). */
  capabilities: string[];
  enabled: boolean;
  /** Optional liveness probe — returns `{ ok }` quickly without side-effects. */
  healthCheck?(): Promise<ProviderHealth>;
}

interface DomainBucket<P extends BaseProvider> {
  providers: Map<string, P>;
  health: Map<string, ProviderHealth>;
}

const buckets = new Map<ProviderDomain, DomainBucket<BaseProvider>>();

function bucket(domain: ProviderDomain): DomainBucket<BaseProvider> {
  let b = buckets.get(domain);
  if (!b) {
    b = { providers: new Map(), health: new Map() };
    buckets.set(domain, b);
  }
  return b;
}

/** Register (or replace) a provider in its domain. */
export function registerProvider<P extends BaseProvider>(
  domain: ProviderDomain,
  provider: P,
): void {
  bucket(domain).providers.set(provider.key, provider);
}

/** Get a single provider by key. */
export function getProvider<P extends BaseProvider = BaseProvider>(
  domain: ProviderDomain,
  key: string,
): P | undefined {
  return bucket(domain).providers.get(key) as P | undefined;
}

/** All enabled providers in a domain, sorted by priority. */
export function listProviders<P extends BaseProvider = BaseProvider>(
  domain: ProviderDomain,
  opts: { capability?: string; includeDisabled?: boolean } = {},
): P[] {
  const all = Array.from(bucket(domain).providers.values()) as P[];
  return all
    .filter((p) => opts.includeDisabled || p.enabled)
    .filter((p) => !opts.capability || p.capabilities.includes(opts.capability))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Resolve a fallback chain: returns the first healthy+enabled provider with
 * the required capability, or `undefined`. Does NOT trigger network calls;
 * uses the last cached health result (call `runHealthCheck` to refresh).
 */
export function fallbackProvider<P extends BaseProvider = BaseProvider>(
  domain: ProviderDomain,
  capability?: string,
): P | undefined {
  const b = bucket(domain);
  for (const p of listProviders<P>(domain, { capability })) {
    const h = b.health.get(p.key);
    if (!h || h.ok) return p;
  }
  return undefined;
}

/** Run the provider's healthCheck (if implemented) and cache the result. */
export async function runHealthCheck(
  domain: ProviderDomain,
  key: string,
): Promise<ProviderHealth> {
  const b = bucket(domain);
  const p = b.providers.get(key);
  if (!p) {
    const r: ProviderHealth = { ok: false, error: "unknown_provider", checkedAt: Date.now() };
    return r;
  }
  if (!p.healthCheck) {
    const r: ProviderHealth = { ok: p.enabled, checkedAt: Date.now() };
    b.health.set(key, r);
    return r;
  }
  const t0 = Date.now();
  try {
    const result = await p.healthCheck();
    const r: ProviderHealth = { ...result, latencyMs: result.latencyMs ?? Date.now() - t0 };
    b.health.set(key, r);
    return r;
  } catch (err) {
    const r: ProviderHealth = {
      ok: false, error: (err as Error).message, latencyMs: Date.now() - t0, checkedAt: Date.now(),
    };
    b.health.set(key, r);
    return r;
  }
}

/** Snapshot for diagnostics panels (read-only). */
export function getRegistrySnapshot() {
  const out: Record<string, Array<{ key: string; name: string; priority: number;
    enabled: boolean; capabilities: string[]; health?: ProviderHealth }>> = {};
  for (const [domain, b] of buckets) {
    out[domain] = Array.from(b.providers.values()).map((p) => ({
      key: p.key, name: p.name, priority: p.priority,
      enabled: p.enabled, capabilities: p.capabilities,
      health: b.health.get(p.key),
    }));
  }
  return out;
}

/** Test-only — wipe everything. */
export function resetRegistry() { buckets.clear(); }
