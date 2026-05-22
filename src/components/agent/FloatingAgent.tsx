import { lazy, Suspense, useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

const AgentPanel = lazy(() => import("./AgentPanel"));

/**
 * Floating AI Agent — Phase 1 shell.
 *
 * - Single mount (placed once in AppLayout).
 * - Panel is lazy-loaded only on first open (zero runtime cost until used).
 * - No providers, no global context, no polling. Pure presentational shell
 *   wired to the decoupled agentBus + useAgentContext.
 */
export function FloatingAgent() {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [pulse, setPulse] = useState(false);

  // Subtle idle pulse every ~6s — pure CSS class toggle, no re-render storm.
  useEffect(() => {
    const id = setInterval(() => {
      setPulse((p) => !p);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {/* Floating orb */}
      <button
        type="button"
        aria-label={open ? "Fechar agente" : "Abrir agente"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={cn(
          "fixed z-[60] bottom-5 right-5 md:bottom-6 md:right-6",
          "h-14 w-14 rounded-full",
          "flex items-center justify-center",
          "transition-transform duration-300 ease-out",
          "shadow-[0_0_24px_-4px_hsl(210_100%_55%/0.65),0_0_48px_-8px_hsl(0_85%_55%/0.35)]",
          "hover:scale-110 active:scale-95",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[hsl(210_100%_60%)]",
        )}
        style={{
          background:
            "radial-gradient(circle at 30% 25%, hsl(210 100% 65%) 0%, hsl(220 90% 35%) 45%, hsl(0 75% 30%) 100%)",
        }}
      >
        {/* Outer rotating ring */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full border border-[hsl(210_100%_70%/0.45)]",
            "animate-[spin_8s_linear_infinite]",
          )}
          style={{
            borderTopColor: "hsl(0 85% 55% / 0.7)",
            borderRightColor: "transparent",
          }}
        />
        {/* Inner core */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-1.5 rounded-full",
            "bg-[radial-gradient(circle_at_50%_45%,hsl(210_100%_75%)_0%,hsl(220_90%_25%)_70%)]",
            pulse ? "opacity-100" : "opacity-85",
            "transition-opacity duration-1000",
          )}
        />
        {/* Eye */}
        <span
          aria-hidden
          className={cn(
            "relative z-10 block h-2.5 w-2.5 rounded-full",
            "bg-[hsl(0_0%_100%)]",
            "shadow-[0_0_10px_2px_hsl(210_100%_70%/0.9)]",
            hover && "shadow-[0_0_14px_3px_hsl(0_90%_60%/0.9)]",
            "transition-all duration-300",
          )}
        />
        <Bot
          aria-hidden
          className="absolute h-0 w-0 opacity-0"
        />
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
