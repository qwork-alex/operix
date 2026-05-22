/**
 * AIPresenceLayer — THE single global AI entity (friendly companion).
 *
 * Renders the 3D QWRobotEntity at the position computed by the
 * MovementOrchestrator. Removes the legacy halo/alarm orb visuals
 * in favor of subtle character-driven cues from the robot itself.
 *
 * Adds:
 *   - drag-to-reposition (pointer drag) with momentum-free settle
 *   - persistent pinned position (localStorage)
 *   - long-press to unpin (release back to auto-positioning)
 *   - subtle floating shadow that follows the robot
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAI } from "./AIProvider";
import { AGENT_OVERLAY_SIZE, movementOrchestrator } from "@/agents/presence/MovementOrchestrator";
import { QWRobotEntity } from "@/ai/entity";

const AgentPanel = lazy(() => import("@/components/agent/AgentPanel"));

const ROBOT_SIZE = Math.round(AGENT_OVERLAY_SIZE * 1.6);
const DRAG_THRESHOLD = 4; // px before a click becomes a drag
const LONG_PRESS_MS = 650;

export function AIPresenceLayer() {
  const { snapshot, open, close, toggle } = useAI();
  const { visual, position, mode, visible, lastEvent } = snapshot;
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);

  // refs for drag bookkeeping
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
    longPressTimer: number | null;
  } | null>(null);

  useEffect(() => {
    const h = () => open();
    window.addEventListener("qwork:agent:open-request", h);
    return () => window.removeEventListener("qwork:agent:open-request", h);
  }, [open]);

  const expanded = mode === "expanded";

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (expanded) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
      longPressTimer: window.setTimeout(() => {
        // Long press releases the pin
        movementOrchestrator.setPinned(false);
        // tiny haptic-style nudge
        if (dragState.current) dragState.current.moved = true;
      }, LONG_PRESS_MS),
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragState.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
      if (d.longPressTimer) {
        window.clearTimeout(d.longPressTimer);
        d.longPressTimer = null;
      }
    }
    const nextX = Math.max(8, Math.min(window.innerWidth - AGENT_OVERLAY_SIZE - 8, d.originX + dx));
    const nextY = Math.max(8, Math.min(window.innerHeight - AGENT_OVERLAY_SIZE - 8, d.originY + dy));
    movementOrchestrator.setManualPosition({ x: nextX, y: nextY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragState.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.longPressTimer) window.clearTimeout(d.longPressTimer);
    const wasDrag = d.moved;
    dragState.current = null;
    setDragging(false);
    if (wasDrag) {
      // Persist as pinned position
      movementOrchestrator.setPinned(true);
    } else {
      toggle();
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={expanded ? "Recolher assistente" : "Abrir assistente"}
        aria-expanded={expanded}
        title={lastEvent ?? visual.label}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className={cn(
          "fixed top-0 left-0 z-[60] outline-none rounded-full select-none",
          visible ? "opacity-100" : "opacity-0 pointer-events-none",
          "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[hsl(205_95%_70%)]",
        )}
        style={{
          width: ROBOT_SIZE,
          height: ROBOT_SIZE,
          transform: `translate3d(${position.x - (ROBOT_SIZE - AGENT_OVERLAY_SIZE) / 2}px, ${position.y - (ROBOT_SIZE - AGENT_OVERLAY_SIZE) / 2}px, 0) scale(${hover && !dragging ? 1.04 : 1})`,
          transition: dragging
            ? "none"
            : "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 700ms ease-out",
          willChange: "transform, opacity",
          cursor: dragging ? "grabbing" : "grab",
          touchAction: "none",
        }}
      >
        <QWRobotEntity size={ROBOT_SIZE} />
      </div>

      {expanded && (
        <Suspense fallback={null}>
          <AgentPanel onClose={close} />
        </Suspense>
      )}
    </>
  );
}

export default AIPresenceLayer;
