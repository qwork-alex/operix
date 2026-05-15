/**
 * MapEngine — facade for MapLibre lifecycle.
 *
 * Responsibilities:
 *  - WebGL probe before instantiation
 *  - construct + dispose the map safely
 *  - expose a single `webglcontextlost` hook so callers can surface a retry UI
 *
 * PR1 keeps this as an opt-in helper. The existing OperationalMap continues to
 * own its init code; PR2 will migrate it onto MapEngine.
 */
import maplibregl, { Map as MlMap, MapOptions } from "maplibre-gl";

export function probeWebGL(): { ok: boolean; reason?: string } {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      (canvas as any).getContext("experimental-webgl");
    if (!gl) return { ok: false, reason: "WebGL não disponível neste navegador" };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? "Falha ao testar WebGL" };
  }
}

export interface MapEngineOptions extends MapOptions {
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

export class MapEngine {
  private map: MlMap | null = null;
  private contextLostHandler: (() => void) | null = null;
  private contextRestoredHandler: (() => void) | null = null;

  init(opts: MapEngineOptions): MlMap {
    const probe = probeWebGL();
    if (!probe.ok) throw new Error(probe.reason ?? "WebGL indisponível");
    const { onContextLost, onContextRestored, ...mapOpts } = opts;
    this.map = new maplibregl.Map(mapOpts);

    if (onContextLost) {
      this.contextLostHandler = () => onContextLost();
      this.map.getCanvas().addEventListener("webglcontextlost", this.contextLostHandler, false);
    }
    if (onContextRestored) {
      this.contextRestoredHandler = () => onContextRestored();
      this.map.getCanvas().addEventListener("webglcontextrestored", this.contextRestoredHandler, false);
    }
    return this.map;
  }

  get instance(): MlMap | null { return this.map; }

  dispose() {
    if (!this.map) return;
    try {
      const canvas = this.map.getCanvas();
      if (this.contextLostHandler) canvas.removeEventListener("webglcontextlost", this.contextLostHandler);
      if (this.contextRestoredHandler) canvas.removeEventListener("webglcontextrestored", this.contextRestoredHandler);
    } catch {}
    try { this.map.remove(); } catch {}
    this.map = null;
    this.contextLostHandler = null;
    this.contextRestoredHandler = null;
  }
}
