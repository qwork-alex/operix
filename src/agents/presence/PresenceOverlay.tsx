/**
 * PresenceOverlay — visual representation of the agent in the viewport.
 *
 * Renders a non-intrusive, position:fixed orb that floats to safe
 * positions computed by the MovementOrchestrator. Pointer-events are
 * disabled by default (purely ambient); hovering the underlying eye
 * area never blocks underlying UI thanks to `pointer-events: none`.
 *
 * Sci-fi inspired (Optimus / Bumblebee) but minimal and premium:
 *   - metallic ring
 *   - eye-core that tracks state
 *   - neon blue idle / red alert
 *   - breathing micro-animation
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PresenceProvider, usePresence } from "./PresenceContext";
import { AGENT_OVERLAY_SIZE } from "./MovementOrchestrator";
import type { PresenceState } from "./types";

const STATE_COLORS: Record<PresenceState, { core: string; ring: string; glow: string }> = {
  idle:       { core: "210 100% 60%", ring: "210 80% 50%",  glow: "210 100% 55%" },
  observing:  { core: "195 100% 60%", ring: "200 80% 55%",  glow: "195 100% 60%" },
  thinking:   { core: "268 84% 66%",  ring: "270 70% 60%",  glow: "268 90% 65%" },
  alert:      { core: "0 95% 60%",    ring: "0 85% 55%",    glow: "0 100% 60%" },
  moving:     { core: "210 100% 65%", ring: "212 80% 55%",  glow: "212 100% 60%" },
  hidden:     { core: "210 50% 40%",  ring: "210 30% 30%",  glow: "210 50% 40%" },
  speaking:   { core: "152 70% 55%",  ring: "152 60% 45%",  glow: "152 80% 55%" },
  diagnosing: { core: "38 95% 58%",   ring: "38 85% 50%",   glow: "38 100% 55%" },
};

function Orb() {
  const { snapshot } = usePresence();
  const [breath, setBreath] = useState(0);

  useEffect(() => {
    if (snapshot.mode === "safe") return;
    let raf = 0;
    let t0 = performance.now();
    const loop = (t: number) => {
      const dt = (t - t0) / 1000;
      setBreath(Math.sin(dt * 1.6) * 0.04);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [snapshot.mode]);

  const c = STATE_COLORS[snapshot.state];
  const scale = 1 + breath;
  const isAlert = snapshot.state === "alert";
  const isThinking = snapshot.state === "thinking" || snapshot.state === "diagnosing";

  return (
    <div
      aria-hidden
      className={cn(
        "fixed top-0 left-0 z-[55] pointer-events-none",
        "transition-opacity duration-700 ease-out",
        snapshot.visible ? "opacity-100" : "opacity-0",
      )}
      style={{
        width: AGENT_OVERLAY_SIZE,
        height: AGENT_OVERLAY_SIZE,
        transform: `translate3d(${snapshot.position.x}px, ${snapshot.position.y}px, 0) scale(${scale})`,
        transition: "transform 60ms linear",
        willChange: "transform, opacity",
      }}
    >
      {/* Outer metallic ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(from 0deg,
            hsl(${c.ring} / 0.0) 0deg,
            hsl(${c.ring} / 0.6) 90deg,
            hsl(${c.ring} / 0.0) 180deg,
            hsl(${c.ring} / 0.4) 270deg,
            hsl(${c.ring} / 0.0) 360deg)`,
          animation: snapshot.mode === "safe" ? "none" : "spin 6s linear infinite",
          maskImage: "radial-gradient(circle, transparent 58%, #000 60%, #000 100%)",
          WebkitMaskImage: "radial-gradient(circle, transparent 58%, #000 60%, #000 100%)",
        }}
      />
      {/* Inner body */}
      <div
        className="absolute rounded-full"
        style={{
          inset: 8,
          background: `radial-gradient(circle at 35% 30%,
            hsl(0 0% 100% / 0.18) 0%,
            hsl(${c.core} / 0.85) 35%,
            hsl(${c.core} / 0.4) 70%,
            hsl(220 30% 8%) 100%)`,
          boxShadow: `
            inset 0 0 12px hsl(0 0% 0% / 0.5),
            0 0 ${isAlert ? 36 : 22}px hsl(${c.glow} / ${isAlert ? 0.85 : 0.55}),
            0 0 ${isAlert ? 64 : 42}px hsl(${c.glow} / ${isAlert ? 0.45 : 0.25})`,
        }}
      />
      {/* Eye core */}
      <div
        className="absolute rounded-full"
        style={{
          left: "50%",
          top: "50%",
          width: 14,
          height: 14,
          transform: "translate(-50%,-50%)",
          background: "radial-gradient(circle, hsl(0 0% 100%) 0%, hsl(0 0% 100% / 0.6) 60%, transparent 100%)",
          boxShadow: `0 0 14px 3px hsl(${c.glow} / 0.95)`,
          animation: isAlert
            ? "agent-pulse-ring 1.1s ease-out infinite"
            : isThinking
              ? "agent-pulse-ring 2.4s ease-in-out infinite"
              : "none",
        }}
      />
      {/* Reflective highlight */}
      <div
        className="absolute rounded-full"
        style={{
          left: "22%",
          top: "16%",
          width: "26%",
          height: "18%",
          background: "radial-gradient(ellipse, hsl(0 0% 100% / 0.55) 0%, transparent 70%)",
          filter: "blur(1px)",
        }}
      />
    </div>
  );
}

/**
 * Top-level component — wraps Provider around Orb so the engine is
 * scoped to the layout and torn down with it.
 */
export function PresenceOverlay() {
  return (
    <PresenceProvider>
      <Orb />
    </PresenceProvider>
  );
}

export default PresenceOverlay;
