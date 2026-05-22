import type { BaseProvider } from "../registry";

export type GeocodingCapability = "forward" | "reverse" | "autocomplete";

export interface GeoResult {
  label: string;
  lat: number;
  lng: number;
  country?: string;
  region?: string;
  raw?: unknown;
}

export interface GeocodingProvider extends BaseProvider {
  capabilities: GeocodingCapability[];
  forward?(query: string): Promise<GeoResult[]>;
  reverse?(lat: number, lng: number): Promise<GeoResult | null>;
}
