/**
 * operational-map — modular engine for the climate-operational map.
 *
 * PR1 ships scaffolding only: MapEngine, LayerRegistry, TemporalEngine,
 * safeOps, PerfMonitor and the DiagnosticBadge UI. The existing
 * OperationalMap component continues to own its rendering and will migrate
 * onto these primitives in subsequent PRs.
 */
export { MapEngine, probeWebGL } from "./core/MapEngine";
export { LayerRegistry, type MapLayer, type LayerCategory } from "./core/LayerRegistry";
export { TemporalEngine, type TemporalState } from "./core/TemporalEngine";
export { PerfMonitor, type PerfSnapshot } from "./core/PerfMonitor";
export {
  safeSetData, safeSetTiles, safeSetPaint, safeSetLayout,
  safeRemoveLayer, safeRemoveSource,
} from "./core/safeOps";
export { DiagnosticBadge } from "./ui/DiagnosticBadge";
