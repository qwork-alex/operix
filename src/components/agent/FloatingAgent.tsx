import { lazy, Suspense, useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOperationalSignals, type SignalLevel } from "@/hooks/useOperationalSignals";

const AgentPanel = lazy(() => import("./AgentPanel"));

/**
 * Floating AI Agent — Phase 2 contextual shell.
 *
 * Visual reactions tied to operational signals (no polling, no React storm):
 *  - ok    → calm blue
 *  - info  → cyan glow
 *  - warn  → amber pulse
 *  - error → red pulse
 */

const LEVEL_GRADIENT: Record<SignalLevel, string> = {
  ok: "radial-gradient(circle at 30% 25%, hsl(210 100% 65%) 0%, hsl(220 90% 35%) 45%, hsl(220 60% 18%) 100%)",
  info: "radial-gradient(circle at 30% 25%, hsl(195 100% 65%) 0%, hsl(210 90% 38%) 50%, hsl(220 70% 20%) 100%)",
  warn: "radial-gradient(circle at 30% 25%, hsl(38 100% 60%) 0%, hsl(28 90% 38%) 50%, hsl(0 60% 22%) 100%)",
  error: "radial-gradient(circle at 30% 25%, hsl(0 100% 65%) 0%, hsl(0 85% 38%) 50%, hsl(0 70% 20%) 100%)",
};

const LEVEL_SHADOW: Record<SignalLevel, string> = {
  ok: "0 0 24px -4px hsl(210 100% 55% / 0.65), 0 0 48px -8px hsl(0 85% 55% / 0.25)",
  info: "0 0 26px -4px hsl(195 100% 55% / 0.7), 0 0 52px -8px hsl(210 100% 55% / 0.4)",
  warn: "0 0 28px -4px hsl(38 100% 55% / 0.85), 0 0 56px -8px hsl(30 100% 50% / 0.5)",
  error: "0 0 32px -4px hsl(0 95% 55% / 0.95), 0 0 64px -8px hsl(0 90% 50% / 0.6)",
};

export function FloatingAgent() {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [pulse, setPulse] = useState(false);
  const { worst, signals } = useOperationalSignals();

  // Subtle idle pulse — pure CSS class toggle, no re-render storm.
  useEffect(() => {
    const id = setInterval(() => setPulse((p) => !p), 6000);
    return () => clearInterval(id);
  }, []);

  const urgent = worst === "warn" || worst === "error";

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Fechar agente" : "Abrir agente"}
        aria-expanded={open}
        title={signals[0]?.title}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={cn(
          "fixed z-[60] bottom-5 right-5 md:bottom-6 md:right-6",
          "h-14 w-14 rounded-full flex items-center justify-center",
          "transition-all duration-500 ease-out",
          "hover:scale-110 active:scale-95",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[hsl(210_100%_60%)]",
          urgent && "animate-pulse",
        )}
        style={{
          background: LEVEL_GRADIENT[worst],
          boxShadow: LEVEL_SHADOW[worst],
        }}
      >
        {/* Outer rotating ring */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full border",
            "animate-[spin_8s_linear_infinite]",
          )}
          style={{
            borderColor:
              worst === "error"
                ? "hsl(0 100% 70% / 0.5)"
                : worst === "warn"
                  ? "hsl(38 100% 65% / 0.5)"
                  : "hsl(210 100% 70% / 0.45)",
            borderTopColor:
              worst === "ok"
                ? "hsl(0 85% 55% / 0.7)"
                : worst === "info"
                  ? "hsl(195 100% 60% / 0.8)"
                  : "transparent",
            borderRightColor: "transparent",
          }}
        />
        {/* Inner core */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-1.5 rounded-full transition-opacity duration-1000",
            pulse ? "opacity-100" : "opacity-85",
          )}
          style={{
            background:
              "radial-gradient(circle at 50% 45%, hsl(0 0% 100% / 0.85) 0%, transparent 65%)",
          }}
        />
        {/* Eye */}
        <span
          aria-hidden
          className={cn(
            "relative z-10 block h-2.5 w-2.5 rounded-full bg-white",
            "transition-all duration-300",
          )}
          style={{
            boxShadow: hover
              ? "0 0 14px 3px hsl(0 90% 60% / 0.9)"
              : "0 0 10px 2px hsl(210 100% 70% / 0.9)",
          }}
        />
        <Bot aria-hidden className="absolute h-0 w-0 opacity-0" />
      </button>

      {open && (
        <Suspense fallback={null}>
          <AgentPanel onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

export default FloatingAgent;
