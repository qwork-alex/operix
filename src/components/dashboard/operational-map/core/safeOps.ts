/**
 * safeOps — defensive wrappers around MapLibre imperative APIs.
 *
 * Goal: a single failing layer (HMR, race, lost WebGL context, missing source)
 * must NEVER crash the rest of the map. All imperative ops route through here.
 */
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";

const isAlive = (map: MlMap | null | undefined): map is MlMap =>
  !!map && !!(map as any).style;

export function safeSetData(
  map: MlMap | null | undefined,
  sourceId: string,
  data: GeoJSON.FeatureCollection | GeoJSON.Feature | any,
): boolean {
  if (!isAlive(map)) return false;
  try {
    const src = map.getSource(sourceId) as GeoJSONSource | undefined;
    if (!src || typeof (src as any).setData !== "function") return false;
    src.setData(data);
    return true;
  } catch (e) {
    console.warn(`[safeOps.setData] ${sourceId} skipped`, e);
    return false;
  }
}

export function safeSetTiles(
  map: MlMap | null | undefined,
  sourceId: string,
  tiles: string[],
): boolean {
  if (!isAlive(map)) return false;
  try {
    const src = map.getSource(sourceId) as any;
    if (!src || typeof src.setTiles !== "function") return false;
    src.setTiles(tiles);
    return true;
  } catch (e) {
    console.warn(`[safeOps.setTiles] ${sourceId} skipped`, e);
    return false;
  }
}

export function safeSetPaint(
  map: MlMap | null | undefined,
  layerId: string,
  prop: string,
  value: any,
): boolean {
  if (!isAlive(map)) return false;
  try {
    if (!map.getLayer(layerId)) return false;
    map.setPaintProperty(layerId, prop as any, value);
    return true;
  } catch (e) {
    console.warn(`[safeOps.setPaint] ${layerId}.${prop} skipped`, e);
    return false;
  }
}

export function safeSetLayout(
  map: MlMap | null | undefined,
  layerId: string,
  prop: string,
  value: any,
): boolean {
  if (!isAlive(map)) return false;
  try {
    if (!map.getLayer(layerId)) return false;
    map.setLayoutProperty(layerId, prop as any, value);
    return true;
  } catch (e) {
    console.warn(`[safeOps.setLayout] ${layerId}.${prop} skipped`, e);
    return false;
  }
}

export function safeRemoveLayer(map: MlMap | null | undefined, layerId: string): void {
  if (!isAlive(map)) return;
  try { if (map.getLayer(layerId)) map.removeLayer(layerId); } catch (e) {
    console.warn(`[safeOps.removeLayer] ${layerId}`, e);
  }
}

export function safeRemoveSource(map: MlMap | null | undefined, sourceId: string): void {
  if (!isAlive(map)) return;
  try { if (map.getSource(sourceId)) map.removeSource(sourceId); } catch (e) {
    console.warn(`[safeOps.removeSource] ${sourceId}`, e);
  }
}
