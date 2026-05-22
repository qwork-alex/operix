/**
 * AIPresenceLayer — THE single global AI entity.
 *
 * Visual core is now the 3D QWRobotEntity. State, position and
 * click-to-expand behaviour come from the unchanged AIProvider /
 * GlobalAIState / MovementOrchestrator pipeline.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAI } from "./AIProvider";
import { AGENT_OVERLAY_SIZE } from "@/agents/presence/MovementOrchestrator";
import { QWRobotEntity } from "@/ai/entity";

const AgentPanel = lazy(() => import("@/components/agent/AgentPanel"));

// Robot needs a bit more canvas room than the legacy orb.
const ROBOT_SIZE = Math.round(AGENT_OVERLAY_SIZE * 1.6);

export function AIPresenceLayer() {
  const { snapshot, open, close, toggle } = useAI();
  const { visual, position, mode, visible, lastEvent } = snapshot;
  const [hover, setHover] = useState(false);

  // Conversation bubble → open expanded console
  useEffect(() => {
    const h = () => open();
    window.addEventListener("qwork:agent:open-request", h);
    return () => window.removeEventListener("qwork:agent:open-request", h);
  }, [open]);

  const expanded = mode === "expanded";

  return (
    <>
      <button
        type="button"
        aria-label={expanded ? "Recolher robô operacional" : "Abrir robô operacional"}
        aria-expanded={expanded}
        title={lastEvent ?? visual.label}
        onClick={toggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={cn(
          "fixed top-0 left-0 z-[60] outline-none rounded-full",
          visible ? "opacity-100" : "opacity-0 pointer-events-none",
          "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[hsl(195_100%_60%)]",
        )}
        style={{
          width: ROBOT_SIZE,
          height: ROBOT_SIZE,
          // re-center: keep the entity anchor consistent with the
          // legacy orb footprint so MovementOrchestrator math stays valid.
          transform: `translate3d(${position.x - (ROBOT_SIZE - AGENT_OVERLAY_SIZE) / 2}px, ${position.y - (ROBOT_SIZE - AGENT_OVERLAY_SIZE) / 2}px, 0) scale(${hover ? 1.05 : 1})`,
          transition: "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 700ms ease-out",
          willChange: "transform, opacity",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        {/* halo behind robot */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, hsl(${visual.hue} / ${0.18 * visual.glow}) 0%, transparent 65%)`,
            filter: `blur(${6 + visual.glow * 10}px)`,
          }}
        />
        <QWRobotEntity size={ROBOT_SIZE} />
        {/* alarm pulse */}
        {visual.alarm && (
          <span
            aria-hidden
            className="absolute inset-3 rounded-full pointer-events-none"
            style={{
              border: `1.5px solid hsl(${visual.hue})`,
              animation: "agent-pulse-ring 1s ease-out infinite",
              opacity: 0.5,
            }}
          />
        )}
        {/* label */}
        <span
          aria-hidden
          className={cn(
            "absolute left-1/2 -translate-x-1/2 -bottom-2",
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

      {expanded && (
        <Suspense fallback={null}>
          <AgentPanel onClose={close} />
        </Suspense>
      )}
    </>
  );
}

export default AIPresenceLayer;
