import type { BaseProvider } from "../registry";

export type MapCapability = "tiles" | "radar" | "satellite" | "vector";

export interface MapProvider extends BaseProvider {
  capabilities: MapCapability[];
  /** Returns a tile URL template (XYZ scheme). */
  tileUrl?(layer: MapCapability): string;
}
