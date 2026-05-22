/**
 * ConversationBubble — non-intrusive, expandable contextual bubble.
 *
 * Appears near the floating agent (bottom-right) only when the
 * ConversationOrchestrator decides the issue is worth interrupting
 * for. Strict rate-limiting and dedup live in the orchestrator;
 * this component is purely presentational + interaction.
 *
 * States:
 *   - collapsed: compact one-liner with urgency dot
 *   - expanded:  question + detail + inline quick actions
 */
import { useEffect, useState } from "react";
import { AlertTriangle, AlertCircle, ChevronDown, X, BellOff, Stethoscope, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConversationPrompt } from "./useConversationPrompt";
import { useAI } from "@/agents/ai";
import { AGENT_OVERLAY_SIZE } from "@/agents/presence/MovementOrchestrator";

interface Props {
  /** Called when user accepts → opens the full Agent diagnostic panel. */
  onOpenDiagnostic: (correlationKey: string) => void;
}

const URGENCY_STYLE = {
  critical: { dot: "hsl(0 95% 60%)",  glow: "hsl(0 95% 55% / 0.55)",  border: "hsl(0 90% 55% / 0.5)" },
  high:     { dot: "hsl(38 95% 58%)", glow: "hsl(38 95% 55% / 0.45)", border: "hsl(38 90% 55% / 0.45)" },
  normal:   { dot: "hsl(195 100% 60%)", glow: "hsl(195 100% 55% / 0.35)", border: "hsl(195 90% 60% / 0.35)" },
  low:      { dot: "hsl(210 80% 60%)", glow: "hsl(210 80% 55% / 0.3)",  border: "hsl(210 80% 60% / 0.3)" },
} as const;

export function ConversationBubble({ onOpenDiagnostic }: Props) {
  const { prompt, dismiss, mute, consume } = useConversationPrompt();
  const { snapshot: aiSnap } = useAI();
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (prompt) {
      setMounted(true);
      // Critical prompts auto-expand
      setExpanded(prompt.urgency === "critical");
    } else {
      const t = setTimeout(() => setMounted(false), 320);
      setExpanded(false);
      return () => clearTimeout(t);
    }
  }, [prompt?.id, prompt?.urgency]);

  if (!prompt && !mounted) return null;
  const p = prompt;
  if (!p) return null;

  const s = URGENCY_STYLE[p.urgency] ?? URGENCY_STYLE.normal;
  const Icon = p.urgency === "critical" ? AlertCircle : AlertTriangle;

  // Dock the bubble to the robot's actual screen position (single entity feel).
  // Position above the robot, anchored to its right edge.
  const bubbleWidth = 360;
  const robotCx = aiSnap.position.x + AGENT_OVERLAY_SIZE / 2;
  const robotTop = aiSnap.position.y;
  const left = Math.max(12, Math.min(window.innerWidth - bubbleWidth - 12, robotCx - bubbleWidth / 2));
  const top = Math.max(12, robotTop - 110);

  return (
    <div
      role="dialog"
      aria-label="Sugestão operacional do agente"
      className={cn(
        "fixed z-[58]",
        "rounded-2xl backdrop-blur-xl",
        "transition-all duration-300 ease-out",
        prompt ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
      )}
      style={{
        top,
        left,
        width: `min(${bubbleWidth}px, calc(100vw - 24px))`,
        background: "hsl(220 50% 5% / 0.92)",
        border: `1px solid ${s.border}`,
        boxShadow: `0 20px 60px -20px hsl(220 90% 5% / 0.9), 0 0 24px ${s.glow}`,
      }}
    >
      {/* notch pointing to the robot */}
      <span
        aria-hidden
        className="absolute -bottom-1.5 h-3 w-3 rotate-45"
        style={{
          left: Math.max(16, Math.min(bubbleWidth - 28, robotCx - left - 6)),
          background: "hsl(220 50% 5% / 0.92)",
          borderRight: `1px solid ${s.border}`,
          borderBottom: `1px solid ${s.border}`,
        }}
      />

      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left"
        aria-expanded={expanded}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: s.dot }} />
        <span className="flex-1 min-w-0 text-[12px] font-medium text-white/90 truncate">
          {p.question}
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-white/40 transition-transform", expanded && "rotate-180")}
        />
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3.5 pb-3 pt-1 border-t border-white/5 animate-in fade-in slide-in-from-top-1 duration-200">
          {p.detail && (
            <p className="text-[11px] text-white/55 leading-relaxed mb-2.5 line-clamp-3">
              {p.detail}
            </p>
          )}

          {p.fixes.length > 0 && (
            <div className="mb-2.5">
              <div className="text-[9px] uppercase tracking-[0.15em] text-white/35 mb-1">
                Ações sugeridas
              </div>
              <ul className="space-y-1">
                {p.fixes.slice(0, 2).map((f) => (
                  <li
                    key={f.id}
                    className="text-[11px] text-white/70 flex items-start gap-1.5 leading-snug"
                  >
                    <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-white/30" />
                    <span className="min-w-0">{f.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Inline actions */}
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => { onOpenDiagnostic(p.correlationKey); consume(); }}
              className={cn(
                "flex-1 h-8 rounded-md px-2.5 text-[11px] font-medium inline-flex items-center justify-center gap-1.5",
                "transition-colors",
              )}
              style={{
                background: `linear-gradient(135deg, ${s.dot}, hsl(220 70% 25%))`,
                color: "hsl(0 0% 100%)",
                boxShadow: `0 0 14px ${s.glow}`,
              }}
            >
              <Stethoscope className="h-3.5 w-3.5" />
              Abrir diagnóstico
            </button>
            <button
              type="button"
              onClick={dismiss}
              title="Dispensar"
              className="h-8 w-8 rounded-md inline-flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={mute}
              title="Silenciar este alerta"
              className="h-8 w-8 rounded-md inline-flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <BellOff className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConversationBubble;
