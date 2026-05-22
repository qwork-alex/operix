/**
 * CharacterLayer — visual augmentation rendered alongside the
 * PresenceOverlay. Provides:
 *   - posture-aware scale/tilt halo
 *   - eye micro-expressions (narrow, wide, blink, scan)
 *   - mood-tinted aura ring
 *   - optional short speech bubble (technical, jarvis-style)
 *
 * It does NOT replace the PresenceOverlay orb — it composes on top
 * via a fixed, pointer-events:none layer that tracks the presence
 * position.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CharacterProvider, useCharacter } from "./CharacterContext";
import { usePresence, PresenceProvider } from "@/agents/presence/PresenceContext";
import { AGENT_OVERLAY_SIZE } from "@/agents/presence/MovementOrchestrator";

function postureTransform(posture: string): string {
  switch (posture) {
    case "alert":     return "scale(1.08)";
    case "upright":   return "scale(1.02)";
    case "leaning":   return "scale(1.04) rotate(-4deg)";
    case "retracted": return "scale(0.86)";
    case "relaxed":
    default:          return "scale(1)";
  }
}

function Eye() {
  const { snapshot } = useCharacter();
  const { eye } = snapshot.mood;
  const [blinking, setBlinking] = useState(false);

  // Contextual blinking — slower while dormant, faster while alarmed
  useEffect(() => {
    const base = snapshot.mood.emotion === "alarmed" ? 1800
      : snapshot.mood.emotion === "dormant" ? 9000
      : 4500;
    let cancelled = false;
    const loop = () => {
      const next = base + Math.random() * 1500;
      setTimeout(() => {
        if (cancelled) return;
        setBlinking(true);
        setTimeout(() => !cancelled && setBlinking(false), 110);
        loop();
      }, next);
    };
    loop();
    return () => { cancelled = true; };
  }, [snapshot.mood.emotion]);

  const height = blinking || eye === "closed" ? 2 : eye === "narrowed" ? 5 : eye === "wide" ? 16 : 10;
  const width = eye === "wide" ? 16 : eye === "scan" ? 12 : 10;

  return (
    <div
      aria-hidden
      className="absolute left-1/2 top-1/2 rounded-full transition-all duration-150 ease-out"
      style={{
        width,
        height,
        transform: `translate(-50%,-50%) ${eye === "scan" ? "scaleX(1.2)" : ""}`,
        background: "radial-gradient(circle, hsl(0 0% 100%) 0%, hsl(0 0% 100% / 0.5) 60%, transparent 100%)",
        boxShadow: `0 0 14px 3px hsl(${snapshot.mood.hue} / 0.9)`,
        opacity: blinking ? 0.3 : 1,
      }}
    />
  );
}

function Aura() {
  const { snapshot } = useCharacter();
  const { mood } = snapshot;
  const { micro } = mood;

  const animation =
    micro.kind === "throb" ? `agent-pulse-ring ${micro.period}s ease-out infinite`
    : micro.kind === "pulse" ? `agent-pulse-ring ${micro.period}s ease-in-out infinite`
    : micro.kind === "scan"  ? `spin ${micro.period * 2}s linear infinite`
    : "none";

  return (
    <div
      aria-hidden
      className="absolute inset-0 rounded-full"
      style={{
        boxShadow: `0 0 ${24 + mood.energy * 40}px hsl(${mood.hue} / ${0.25 + mood.energy * 0.5}),
                    0 0 ${48 + mood.energy * 80}px hsl(${mood.accent} / ${0.15 + mood.energy * 0.3})`,
        animation,
        transition: "box-shadow 600ms ease-out",
      }}
    />
  );
}

function SpeechBubble() {
  const { snapshot } = useCharacter();
  if (!snapshot.line) return null;
  return (
    <div
      className={cn(
        "absolute right-[110%] top-1/2 -translate-y-1/2",
        "max-w-[240px] px-3 py-2 rounded-lg",
        "text-[11px] font-medium tracking-wide",
        "border backdrop-blur-md",
        "animate-fade-in",
      )}
      style={{
        background: "hsl(220 30% 8% / 0.85)",
        borderColor: `hsl(${snapshot.mood.hue} / 0.5)`,
        color: "hsl(0 0% 95%)",
        boxShadow: `0 0 18px hsl(${snapshot.mood.hue} / 0.35)`,
      }}
    >
      {snapshot.line}
    </div>
  );
}

function Layer() {
  const { snapshot: pres } = usePresence();
  const { snapshot: chr } = useCharacter();
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "fixed top-0 left-0 z-[56] pointer-events-none",
        "transition-opacity duration-700 ease-out",
        pres.visible ? "opacity-100" : "opacity-0",
      )}
      style={{
        width: AGENT_OVERLAY_SIZE,
        height: AGENT_OVERLAY_SIZE,
        transform: `translate3d(${pres.position.x}px, ${pres.position.y}px, 0) ${postureTransform(chr.mood.posture)}`,
        transition: "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "transform, opacity",
      }}
    >
      <Aura />
      <Eye />
      <SpeechBubble />
    </div>
  );
}

/**
 * Mounted alongside PresenceOverlay; provides its own Presence + Character
 * providers so it can run as a self-contained augmentation.
 */
export function CharacterLayer() {
  return (
    <PresenceProvider>
      <CharacterProvider>
        <Layer />
      </CharacterProvider>
    </PresenceProvider>
  );
}

export default CharacterLayer;
