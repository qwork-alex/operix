/**
 * DiagnosticBadge — discreet operational telemetry overlay.
 *
 * Shows FPS, layer count and (when available) JS heap. Designed to sit
 * absolutely positioned over the map. Does not depend on map internals;
 * reads from PerfMonitor.
 */
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { PerfMonitor, type PerfSnapshot } from "../core/PerfMonitor";

interface Props {
  provider?: string;
  className?: string;
}

export function DiagnosticBadge({ provider = "RainViewer", className }: Props) {
  const [snap, setSnap] = useState<PerfSnapshot>(() => PerfMonitor.snapshot());

  useEffect(() => {
    PerfMonitor.start();
    const off = PerfMonitor.subscribe(setSnap);
    return () => { off(); };
  }, []);

  const fpsColor =
    snap.fps >= 50 ? "#34d399" :
    snap.fps >= 30 ? "#fbbf24" :
    snap.fps > 0   ? "#f87171" : "#94a3b8";

  return (
    <div
      className={
        "pointer-events-none select-none absolute bottom-2 left-2 z-10 " +
        "flex items-center gap-2 rounded-md border border-white/10 " +
        "bg-[#06121f]/80 backdrop-blur-sm px-2 py-1 text-[10px] " +
        "font-mono text-zinc-300 shadow-md " + (className ?? "")
      }
      title="Diagnóstico do mapa"
    >
      <Activity className="h-3 w-3 text-cyan-400" />
      <span style={{ color: fpsColor }} className="tabular-nums">
        {snap.fps || "--"} FPS
      </span>
      <span className="text-white/20">·</span>
      <span className="tabular-nums">{snap.layers}L</span>
      {snap.jsHeapMb != null && (
        <>
          <span className="text-white/20">·</span>
          <span className="tabular-nums">{snap.jsHeapMb}MB</span>
        </>
      )}
      <span className="text-white/20">·</span>
      <span className="text-cyan-300/70">{provider}</span>
    </div>
  );
}
