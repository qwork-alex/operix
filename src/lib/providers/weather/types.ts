import type { BaseProvider } from "../registry";

export type HailSeverity = "low" | "moderate" | "severe" | "extreme";
export type HailStatus = "forecast" | "ongoing" | "confirmed" | "closed";

export interface NormalizedHailEvent {
  source: string;
  externalId: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  lat: number;
  lng: number;
  radiusKm?: number;
  severity: HailSeverity;
  status: HailStatus;
  hailSizeMm?: number | null;
  probability?: number | null;
  intensity?: number | null;
  forecastTime?: string | null;
  observedTime?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface WeatherFetchCtx {
  /** ISO 3166-1 alpha-2 country / region key (e.g. "FR", "US", "CA"). */
  region: string;
  apiKey?: string;
}

export type WeatherCapability =
  | "hail" | "alerts" | "severe" | "radar" | "precipitation" | "wind" | "lightning";

export interface WeatherProvider extends BaseProvider {
  capabilities: WeatherCapability[];
  fetchHail?(ctx: WeatherFetchCtx): Promise<NormalizedHailEvent[]>;
}
