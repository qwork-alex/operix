/**
 * AIPresenceLayer — THE single global AI entity.
 *
 * Replaces the legacy trio: FloatingAgent (button) + PresenceOverlay
 * (orb) + CharacterLayer (eye/aura). One entity, one identity, many
 * visual states driven by AIStateMachine + AIVisualEngine.
 *
 * Behaviour:
 *   - Floats in the viewport at the position computed by the
 *     MovementOrchestrator (cinematic motion, never blocks UI).
 *   - Click anywhere on the body → expand into operational panel
 *     (AgentPanel emerges from the entity's own position).
 *   - Layers: rotating energy rings, breathing core, eye, particles.
 *   - Alarm overlay during alert / emergency states.
 *   - Standby drastically reduces motion & opacity.
 *
 * The AgentPanel itself is intentionally re-used (chat content,
 * diagnostics, multimodal) — it is no longer a separate identity but
 * the EXPANDED form of the same entity.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAI } from "./AIProvider";
import { AGENT_OVERLAY_SIZE } from "@/agents/presence/MovementOrchestrator";
import { QWRobotEntity } from "@/ai/entity";

const AgentPanel = lazy(() => import("@/components/agent/AgentPanel"));

const ENTITY_SIZE = AGENT_OVERLAY_SIZE; // unified size

function EnergyRings({ v }: { v: AIVisualFrame }) {
  const rings = Array.from({ length: v.rings });
  return (
    <>
      {rings.map((_, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        const speed = v.spinSec * (1 + i * 0.35);
        const inset = -6 - i * 6;
        return (
          <div
            key={i}
            aria-hidden
            className="absolute rounded-full"
            style={{
              inset,
              border: `1px solid hsl(${v.hue} / ${0.35 - i * 0.07})`,
              maskImage:
                "conic-gradient(from 0deg, transparent 0deg, #000 60deg, #000 300deg, transparent 360deg)",
              WebkitMaskImage:
                "conic-gradient(from 0deg, transparent 0deg, #000 60deg, #000 300deg, transparent 360deg)",
              animation: speed > 0 ? `spin ${speed}s linear ${dir > 0 ? "" : "reverse"} infinite` : undefined,
            }}
          />
        );
      })}
    </>
  );
}

function Particles({ v }: { v: AIVisualFrame }) {
  const items = useMemo(
    () => Array.from({ length: v.particles }).map((_, i) => ({
      angle: (360 / Math.max(1, v.particles)) * i,
      delay: i * 0.35,
    })),
    [v.particles],
  );
  if (!v.particles) return null;
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none">
      {items.map((p, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full"
          style={{
            background: `hsl(${v.hue})`,
            boxShadow: `0 0 8px hsl(${v.hue})`,
            transformOrigin: "0 0",
            transform: `rotate(${p.angle}deg) translate(${ENTITY_SIZE * 0.55}px) translate(-50%,-50%)`,
            animation: `agent-pulse-ring 2.8s ease-out ${p.delay}s infinite`,
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}

function Body({ v, breath }: { v: AIVisualFrame; breath: number }) {
  return (
    <>
      {/* Outer halo */}
      <div
        aria-hidden
        className="absolute -inset-4 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, hsl(${v.hue} / ${0.18 * v.glow}) 0%, transparent 70%)`,
          filter: `blur(${4 + v.glow * 6}px)`,
        }}
      />
      {/* Metal shell */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(from 0deg,
            hsl(${v.accent} / 0) 0deg,
            hsl(${v.accent} / 0.7) 90deg,
            hsl(${v.accent} / 0) 200deg,
            hsl(${v.accent} / 0.5) 290deg,
            hsl(${v.accent} / 0) 360deg)`,
          animation: v.spinSec > 0 ? `spin ${v.spinSec}s linear infinite` : undefined,
          maskImage: "radial-gradient(circle, transparent 56%, #000 58%, #000 100%)",
          WebkitMaskImage: "radial-gradient(circle, transparent 56%, #000 58%, #000 100%)",
        }}
      />
      {/* Core */}
      <div
        aria-hidden
        className="absolute rounded-full"
        style={{
          inset: 8,
          background: `radial-gradient(circle at 35% 28%,
            hsl(0 0% 100% / 0.22) 0%,
            hsl(${v.hue} / 0.9) 30%,
            hsl(${v.hue} / 0.42) 65%,
            hsl(220 30% 6%) 100%)`,
          boxShadow: `
            inset 0 0 18px hsl(0 0% 0% / 0.55),
            0 0 ${22 + v.glow * 36}px hsl(${v.hue} / ${0.55 * v.glow + 0.15}),
            0 0 ${48 + v.glow * 80}px hsl(${v.hue} / ${0.35 * v.glow})`,
          transform: `scale(${1 + breath})`,
          transition: "transform 80ms linear",
        }}
      />
      {/* Eye */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: v.eye,
          height: v.eye,
          transform: "translate(-50%,-50%)",
          background:
            "radial-gradient(circle, hsl(0 0% 100%) 0%, hsl(0 0% 100% / 0.55) 60%, transparent 100%)",
          boxShadow: `0 0 14px 3px hsl(${v.hue} / 0.95)`,
          animation: v.pulseSec > 0 ? `agent-pulse-ring ${v.pulseSec}s ease-in-out infinite` : undefined,
        }}
      />
      {/* Specular highlight */}
      <div
        aria-hidden
        className="absolute rounded-full pointer-events-none"
        style={{
          left: "22%",
          top: "16%",
          width: "26%",
          height: "18%",
          background: "radial-gradient(ellipse, hsl(0 0% 100% / 0.55) 0%, transparent 70%)",
          filter: "blur(1px)",
        }}
      />
      {/* Alarm overlay */}
      {v.alarm && (
        <div
          aria-hidden
          className="absolute -inset-2 rounded-full pointer-events-none"
          style={{
            border: `2px solid hsl(${v.hue})`,
            animation: "agent-pulse-ring 1s ease-out infinite",
            opacity: 0.7,
          }}
        />
      )}
    </>
  );
}

export function AIPresenceLayer() {
  const { snapshot, open, close, toggle } = useAI();
  const { visual, position, state, mode, visible, lastEvent } = snapshot;
  const [breath, setBreath] = useState(0);
  const [hover, setHover] = useState(false);

  // Breathing micro-animation (self-driven, independent of state machine)
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = (t: number) => {
      const dt = (t - t0) / 1000;
      setBreath(Math.sin(dt * (state === "emergency" ? 4 : 1.6)) * visual.breath);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visual.breath, state]);

  // Listen to conversation bubble request → open expanded panel
  useEffect(() => {
    const h = () => open();
    window.addEventListener("qwork:agent:open-request", h);
    return () => window.removeEventListener("qwork:agent:open-request", h);
  }, [open]);

  const expanded = mode === "expanded";

  return (
    <>
      {/* THE entity — always-mounted, position-driven, clickable */}
      <button
        type="button"
        aria-label={expanded ? "Recolher agente operacional" : "Abrir agente operacional"}
        aria-expanded={expanded}
        title={lastEvent ?? visual.label}
        onClick={toggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={cn(
          "fixed top-0 left-0 z-[60] group outline-none",
          "transition-opacity duration-700 ease-out",
          visible ? "opacity-100" : "opacity-0 pointer-events-none",
          "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[hsl(195_100%_60%)] rounded-full",
        )}
        style={{
          width: ENTITY_SIZE,
          height: ENTITY_SIZE,
          transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${hover ? 1.07 : 1})`,
          transition: "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 700ms ease-out",
          willChange: "transform, opacity",
        }}
      >
        <EnergyRings v={visual} />
        <Particles v={visual} />
        <Body v={visual} breath={breath} />

        {/* State label — appears on hover or alert */}
        <span
          aria-hidden
          className={cn(
            "absolute left-1/2 -translate-x-1/2 -bottom-7",
            "px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-[0.18em]",
            "border backdrop-blur-md whitespace-nowrap",
            "transition-opacity duration-200",
            hover || visual.alarm ? "opacity-100" : "opacity-0",
          )}
          style={{
            background: "hsl(220 50% 5% / 0.85)",
            borderColor: `hsl(${visual.hue} / 0.5)`,
            color: `hsl(${visual.hue})`,
            textShadow: `0 0 8px hsl(${visual.hue} / 0.7)`,
          }}
        >
          {visual.label}
        </span>
      </button>

      {/* EXPANDED form — operational panel emerging from the entity */}
      {expanded && (
        <Suspense fallback={null}>
          <AgentPanel onClose={close} />
        </Suspense>
      )}
    </>
  );
}

export default AIPresenceLayer;
