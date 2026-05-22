import { useEffect, useMemo, useRef, useState } from "react";
import { Send, X, Activity, Wifi, WifiOff, MapPin, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { agentBus, type AgentEvent } from "@/lib/agentEventBus";
import { useAgentContext } from "@/hooks/useAgentContext";
import { useOperationalSignals, type SignalLevel } from "@/hooks/useOperationalSignals";


interface Msg {
  id: string;
  from: "agent" | "user";
  text: string;
  at: number;
}

const STORAGE_KEY = "qwork.agent.history.v1";

function loadHistory(): Msg[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Msg[];
    return Array.isArray(parsed) ? parsed.slice(-50) : [];
  } catch {
    return [];
  }
}

function saveHistory(msgs: Msg[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-50)));
  } catch {
    /* quota — ignore */
  }
}

interface Props {
  onClose: () => void;
}

export default function AgentPanel({ onClose }: Props) {
  const ctx = useAgentContext();
  const [messages, setMessages] = useState<Msg[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<AgentEvent[]>(() =>
    agentBus.snapshot().slice(-20),
  );
  const listRef = useRef<HTMLDivElement>(null);

  // Welcome message on first open
  useEffect(() => {
    if (messages.length === 0) {
      const welcome: Msg = {
        id: "welcome",
        from: "agent",
        at: Date.now(),
        text: `Olá. Sou o agente operacional do QWork Nexus. Estou observando o módulo "${ctx.label}". Esta é uma fase inicial — em breve poderei agir.`,
      };
      setMessages([welcome]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist history
  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  // Subscribe to event bus (decoupled, single subscription per mount)
  useEffect(() => {
    const unsub = agentBus.subscribe((evt) => {
      setEvents((prev) => [...prev.slice(-19), evt]);
    });
    return unsub;
  }, []);

  // Auto-scroll
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const statusLines = useMemo(
    () => [
      { icon: MapPin, label: `Você está em ${ctx.label}`, ok: true },
      {
        icon: ctx.online ? Wifi : WifiOff,
        label: ctx.online ? "Realtime operacional ativo" : "Offline — aguardando reconexão",
        ok: ctx.online,
      },
      { icon: Activity, label: "Radar PDR sincronizado", ok: true },
    ],
    [ctx.label, ctx.online],
  );

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    const userMsg: Msg = { id: `u-${Date.now()}`, from: "user", text, at: Date.now() };
    agentBus.emit({ kind: "user_message", level: "info", title: text });
    const replyMsg: Msg = {
      id: `a-${Date.now()}`,
      from: "agent",
      at: Date.now() + 1,
      text: "Recebi sua mensagem. Nesta fase ainda não executo ações — apenas observo. As respostas inteligentes chegam na próxima fase.",
    };
    setMessages((m) => [...m, userMsg, replyMsg]);
    setInput("");
  }

  return (
    <div
      role="dialog"
      aria-label="Painel do agente"
      className={cn(
        "fixed z-[59] bg-card text-card-foreground border border-border",
        "shadow-2xl shadow-black/40",
        // Mobile: bottom sheet
        "inset-x-2 bottom-24 max-h-[70vh] rounded-2xl",
        // Desktop: side panel anchored above orb
        "md:inset-auto md:right-6 md:bottom-24 md:w-[380px] md:max-h-[600px]",
        "flex flex-col overflow-hidden",
        "animate-in fade-in slide-in-from-bottom-4 duration-200",
      )}
      style={{
        boxShadow:
          "0 0 0 1px hsl(210 100% 55% / 0.15), 0 20px 60px -10px hsl(220 90% 10% / 0.6)",
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between border-b border-border"
        style={{
          background:
            "linear-gradient(135deg, hsl(220 60% 12% / 0.6), hsl(0 60% 18% / 0.4))",
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full bg-[hsl(210_100%_60%)] shadow-[0_0_8px_hsl(210_100%_60%)] animate-pulse"
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight truncate">QWork Agent</div>
            <div className="text-[11px] text-muted-foreground truncate">
              Observando · {ctx.label}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Context strip */}
      <div className="px-4 py-2 border-b border-border bg-muted/30 space-y-1">
        {statusLines.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <s.icon
              className={cn(
                "h-3 w-3 shrink-0",
                s.ok ? "text-[hsl(152_60%_45%)]" : "text-destructive",
              )}
            />
            <span className="text-muted-foreground truncate">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[120px]"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug",
              m.from === "agent"
                ? "bg-muted text-foreground rounded-bl-sm"
                : "ml-auto bg-[hsl(210_90%_45%)] text-white rounded-br-sm",
            )}
          >
            {m.text}
          </div>
        ))}
        {events.length > 0 && (
          <details className="mt-2 text-[11px] text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">
              Eventos operacionais ({events.length})
            </summary>
            <ul className="mt-1 space-y-0.5 pl-2">
              {events.slice(-10).reverse().map((e) => (
                <li key={e.id} className="truncate">
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle",
                      e.level === "error" && "bg-destructive",
                      e.level === "warn" && "bg-[hsl(38_92%_55%)]",
                      e.level === "success" && "bg-[hsl(152_60%_45%)]",
                      e.level === "info" && "bg-[hsl(210_100%_60%)]",
                    )}
                  />
                  {e.title}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Composer */}
      <div className="p-2 border-t border-border flex items-end gap-2">
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Fale com o agente…"
          className={cn(
            "flex-1 resize-none bg-background border border-input rounded-md",
            "px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(210_100%_55%)]/40",
            "max-h-32",
          )}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          aria-label="Enviar"
          className={cn(
            "h-9 w-9 shrink-0 rounded-md flex items-center justify-center",
            "bg-[hsl(210_90%_45%)] text-white hover:bg-[hsl(210_90%_40%)]",
            "disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
