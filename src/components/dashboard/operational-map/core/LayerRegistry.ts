/**
 * LayerRegistry — central inventory for map layers.
 *
 * Each layer is registered once with idempotent mount/unmount and an apply()
 * that takes a slice of the current WeatherSnapshot. The registry guarantees
 * stable stacking order and that one failing layer cannot break siblings.
 *
 * PR1 ships only the contract + bookkeeping; concrete layers migrate in PR2+.
 */
import type { Map as MlMap } from "maplibre-gl";
import { PerfMonitor } from "./PerfMonitor";

export type LayerCategory =
  | "radar"
  | "hail"
  | "storm"
  | "orders"
  | "operations"
  | "teams"
  | "pdr"
  | "reports";

export interface MapLayer<TSlice = any> {
  id: string;
  category: LayerCategory;
  /** Stable z-order index — lower draws underneath. */
  order: number;
  mount(map: MlMap): void;
  unmount(map: MlMap): void;
  apply(slice: TSlice, t: number): void;
  setVisible(visible: boolean): void;
}

interface Entry {
  layer: MapLayer<any>;
  mounted: boolean;
  visible: boolean;
}

export class LayerRegistry {
  private map: MlMap | null = null;
  private entries = new Map<string, Entry>();

  attach(map: MlMap) {
    this.map = map;
    // Mount any layers registered before the map was ready.
    for (const e of this.byOrder()) this.mountEntry(e);
  }

  detach() {
    if (!this.map) return;
    for (const e of this.byOrder().reverse()) this.unmountEntry(e);
    this.map = null;
  }

  register(layer: MapLayer<any>, opts?: { visible?: boolean }) {
    if (this.entries.has(layer.id)) {
      console.warn(`[LayerRegistry] duplicate id ${layer.id} ignored`);
      return;
    }
    const entry: Entry = { layer, mounted: false, visible: opts?.visible ?? true };
    this.entries.set(layer.id, entry);
    if (this.map) this.mountEntry(entry);
  }

  unregister(id: string) {
    const e = this.entries.get(id);
    if (!e) return;
    this.unmountEntry(e);
    this.entries.delete(id);
    PerfMonitor.setLayers(this.entries.size);
  }

  setVisible(id: string, visible: boolean) {
    const e = this.entries.get(id);
    if (!e) return;
    e.visible = visible;
    try { e.layer.setVisible(visible); } catch (err) {
      console.warn(`[LayerRegistry] setVisible ${id}`, err);
    }
  }

  applyAll(snapshot: any, t: number) {
    for (const e of this.entries.values()) {
      if (!e.mounted) continue;
      try { e.layer.apply(snapshot, t); } catch (err) {
        console.warn(`[LayerRegistry] apply ${e.layer.id}`, err);
      }
    }
  }

  list(): ReadonlyArray<{ id: string; category: LayerCategory; mounted: boolean; visible: boolean }> {
    return [...this.entries.values()].map((e) => ({
      id: e.layer.id, category: e.layer.category, mounted: e.mounted, visible: e.visible,
    }));
  }

  private byOrder(): Entry[] {
    return [...this.entries.values()].sort((a, b) => a.layer.order - b.layer.order);
  }

  private mountEntry(e: Entry) {
    if (!this.map || e.mounted) return;
    try {
      e.layer.mount(this.map);
      e.layer.setVisible(e.visible);
      e.mounted = true;
      PerfMonitor.setLayers([...this.entries.values()].filter((x) => x.mounted).length);
    } catch (err) {
      console.warn(`[LayerRegistry] mount ${e.layer.id}`, err);
    }
  }

  private unmountEntry(e: Entry) {
    if (!this.map || !e.mounted) return;
    try { e.layer.unmount(this.map); } catch (err) {
      console.warn(`[LayerRegistry] unmount ${e.layer.id}`, err);
    }
    e.mounted = false;
    PerfMonitor.setLayers([...this.entries.values()].filter((x) => x.mounted).length);
  }
}
