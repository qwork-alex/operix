/**
 * AIProvider — top-level React adapter for the single Global AI Entity.
 *
 * Wires:
 *   useOperationalSignals  → globalAI.setSignal
 *   PresenceEngine (idle)  → globalAI.setActivity / setPosition
 *   agentBus               → AIEventReactor
 *   window online/visible  → AIRealtimeConnector
 *
 * Exposes the live snapshot through React context.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useOperationalSignals } from "@/hooks/useOperationalSignals";
import { useWorkspace } from "@/hooks/useWorkspace";
import { presenceEngine } from "@/agents/presence/PresenceEngine";
import { idleTracker } from "@/agents/presence/IdleBehavior";
import { movementOrchestrator, AGENT_OVERLAY_SIZE } from "@/agents/presence/MovementOrchestrator";
import { robotAwareness } from "@/ai/entity/RobotAwareness";
import { operationalMemory } from "@/ai/memory/OperationalMemory";
import { globalAI } from "./GlobalAIState";
import { startAIReactor } from "./AIEventReactor";
import { startAIRealtime } from "./AIRealtimeConnector";
import type { AIEntitySnapshot } from "./types";

interface AICtx {
  snapshot: AIEntitySnapshot;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const Ctx = createContext<AICtx | null>(null);

/**
 * Resolve a DOM element that best represents the given operational signal.
 * Falls back through: explicit signal tag → generic op-alert → role=alert →
 * first matching keyword card.
 */
function resolveSignalElement(signalId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const tries: string[] = [
    `[data-op-signal="${signalId}"]`,
    `[data-op-alert="${signalId}"]`,
    `[data-op-alert]`,
    `[role="alert"]`,
  ];
  for (const sel of tries) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) return el;
    }
  }
  return null;
}

/** Dock the robot near `el` and direct its gaze + arm toward it. */
function guideToElement(el: HTMLElement, reason: string, ttl = 5200) {
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  // Dock on whichever side has space, vertically centered on the element
  const spaceRight = window.innerWidth - r.right;
  const useRight = spaceRight >= r.left;
  const margin = 24;
  const x = useRight
    ? Math.min(window.innerWidth - AGENT_OVERLAY_SIZE - 18, r.right + margin)
    : Math.max(18, r.left - AGENT_OVERLAY_SIZE - margin);
  const y = Math.max(
    80,
    Math.min(window.innerHeight - AGENT_OVERLAY_SIZE - 40, cy - AGENT_OVERLAY_SIZE / 2),
  );
  movementOrchestrator.setContextualAnchor({ x, y }, reason, 8, ttl);
  robotAwareness.guideTo({ x: cx, y: cy }, ttl, reason);
}

export function AIProvider({ children }: { children: ReactNode }) {
  const { signals, worst } = useOperationalSignals();
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<AIEntitySnapshot>(() => globalAI.current());
  const lastSignalRef = useRef(worst);
  const guidedSignalIdsRef = useRef<Set<string>>(new Set());

  // Boot all engines once
  useEffect(() => {
    presenceEngine.start();
    const stopReactor = startAIReactor();
    const stopRealtime = startAIRealtime();

    const unsubIdle = idleTracker.subscribe((lvl) =>
      globalAI.setActivity(lvl === "deep-idle" ? "deepIdle" : lvl === "idle" ? "idle" : "active"),
    );
    const unsubMove = movementOrchestrator.subscribe((m) => {
      globalAI.setPosition(m.position, m.fps);
      globalAI.setVisible(m.visible);
    });
    const unsubAI = globalAI.subscribe(setSnapshot);

    return () => {
      stopReactor(); stopRealtime();
      unsubIdle(); unsubMove(); unsubAI();
    };
  }, []);

  // Operational signals → AI state machine
  useEffect(() => {
    globalAI.setSignal(worst);
  }, [worst]);

  // Reset per-route guidance memory so the robot can re-guide on a new page
  useEffect(() => {
    guidedSignalIdsRef.current.clear();
    // soft glance at the new module — non-guidance, just a polite check
    const t = window.setTimeout(() => {
      robotAwareness.glanceAtElement("main h1, main [role='heading'], main", 1400);
    }, 200);
    return () => window.clearTimeout(t);
  }, [location.pathname]);

  // Operational guidance — fire ONLY when a meaningful new signal appears
  // (warn/error or production anomaly). Each signal id is guided at most
  // once per route to avoid hyperactivity.
  useEffect(() => {
    if (worst === "ok") {
      lastSignalRef.current = "ok";
      return;
    }
    const escalated =
      lastSignalRef.current === "ok" ||
      (lastSignalRef.current === "info" && (worst === "warn" || worst === "error")) ||
      (lastSignalRef.current === "warn" && worst === "error");
    lastSignalRef.current = worst;

    const candidate = signals.find(
      (s) =>
        s.level !== "ok" &&
        s.id !== "all-ok" &&
        !guidedSignalIdsRef.current.has(s.id),
    );
    if (!candidate) return;
    // Only guide on escalation OR on the very first non-ok signal of this route.
    if (!escalated && guidedSignalIdsRef.current.size > 0) return;

    guidedSignalIdsRef.current.add(candidate.id);
    // Wait one frame for any related UI to mount before pointing.
    const t = window.setTimeout(() => {
      const el = resolveSignalElement(candidate.id);
      if (el) guideToElement(el, `signal:${candidate.id}`, candidate.level === "error" ? 6000 : 4800);
      else robotAwareness.glanceAtElement("[data-op-alert], [role='alert']", 1400);
    }, 120);
    return () => window.clearTimeout(t);
  }, [worst, signals]);

  // Confusion detection — repeated rapid clicks on the same target OR
  // repeated form invalid events within a short window. When triggered,
  // the robot moves toward the focused/struggling element to help.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let lastTarget: Element | null = null;
    let clickCount = 0;
    let clickResetT = 0;
    let invalidCount = 0;
    let invalidResetT = 0;
    let lastGuidedAt = 0;
    const GUIDANCE_COOLDOWN = 8000;

    const tryGuide = (el: HTMLElement, reason: string) => {
      const now = Date.now();
      if (now - lastGuidedAt < GUIDANCE_COOLDOWN) return;
      lastGuidedAt = now;
      guideToElement(el, reason, 3800);
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const now = performance.now();
      if (target === lastTarget && now - clickResetT < 1200) {
        clickCount += 1;
      } else {
        clickCount = 1;
        lastTarget = target;
      }
      clickResetT = now;
      // 4+ rapid clicks on the same non-interactive-ish thing → likely confusion
      if (clickCount >= 4) {
        clickCount = 0;
        const el = (target.closest("button, a, [role='button'], input, label") ||
          target.closest("[data-op-card], section, article")) as HTMLElement | null;
        if (el) tryGuide(el, "confusion:repeat-click");
      }
    };

    const onInvalid = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const now = performance.now();
      if (now - invalidResetT > 4000) invalidCount = 0;
      invalidResetT = now;
      invalidCount += 1;
      if (invalidCount >= 2) {
        invalidCount = 0;
        tryGuide(el, "confusion:form-invalid");
      }
    };

    window.addEventListener("click", onClick, true);
    window.addEventListener("invalid", onInvalid, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("invalid", onInvalid, true);
    };
  }, []);


  const api: AICtx = {
    snapshot,
    open: () => globalAI.setMode("expanded"),
    close: () => globalAI.setMode("compact"),
    toggle: () => globalAI.setMode(snapshot.mode === "expanded" ? "compact" : "expanded"),
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAI(): AICtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAI must be used inside <AIProvider>");
  return v;
}
