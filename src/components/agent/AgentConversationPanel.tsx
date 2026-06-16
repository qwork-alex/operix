/**
 * AgentConversationPanel — multimodal operational conversation surface.
 *
 * Não é um chatbot genérico: o painel é técnico/operacional. Permite ao
 * operador:
 *  - conversar em texto com o agente
 *  - anexar screenshot (vision / OCR)
 *  - gravar/anexar áudio (transcrição / ditado técnico)
 *  - anexar runtime snapshot automaticamente (sinais + saúde)
 *  - anexar últimos erros como contexto explícito
 *
 * Servidor injeta sempre o contexto operacional (route, sinais, eventos,
 * snapshot, erros) — o agente NUNCA inventa fora dele.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send, Image as ImageIcon, Mic, MicOff, X, Activity, AlertOctagon,
  Loader2, Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAgentContext } from "@/hooks/useAgentContext";
import { useOperationalSignals } from "@/hooks/useOperationalSignals";
import {
  streamMultimodalReply, fileToDataUrl, dataUrlToBase64,
  RateLimitedError, type ConvTurn, type ContentPart,
} from "@/lib/agentMultimodal";
import { useWorkspace } from "@/hooks/useWorkspace";

type Attachment =
  | { kind: "image"; id: string; dataUrl: string; name: string }
  | { kind: "audio"; id: string; dataUrl: string; mime: string; durationMs: number };

interface Bubble {
  id: string;
  from: "user" | "agent";
  text: string;
  attachments?: Attachment[];
  at: number;
  pending?: boolean;
}

function formatTime(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

interface Props {
  /** When true, the runtime snapshot (signals + health) is attached to every turn. */
  autoAttachSnapshot?: boolean;
  className?: string;
}

export function AgentConversationPanel({ autoAttachSnapshot = true, className }: Props) {
  const ctx = useAgentContext();
  const { signals, recent } = useOperationalSignals();
  const { workspaceId } = useWorkspace();

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attachErrors, setAttachErrors] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStartRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  // Build error-attachment list from operational signals (errors only)
  const errorAttachments = useMemo(() => {
    if (!attachErrors) return undefined;
    return signals
      .filter((s) => s.level === "error" || s.level === "warn")
      .slice(0, 6)
      .map((s) => ({
        source: s.id,
        message: s.detail ? `${s.title} — ${s.detail}` : s.title,
      }));
  }, [signals, attachErrors]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles.length]);

  useEffect(() => () => {
    abortRef.current?.abort();
    mediaRecRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  /* ----------------------------------------------- attachment intake -- */

  async function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Anexa apenas imagens.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Imagem demasiado grande (máx 5 MB).");
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      setPending((p) => [...p, {
        kind: "image",
        id: `img-${Date.now()}`,
        dataUrl: url,
        name: file.name,
      }]);
    } catch {
      toast.error("Falha a ler a imagem.");
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Gravação de áudio não suportada neste navegador.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      audioChunksRef.current = [];
      audioStartRef.current = Date.now();

      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: mime });
        if (blob.size > MAX_AUDIO_BYTES) {
          toast.error("Áudio demasiado longo (máx 3 MB).");
          return;
        }
        const url = await fileToDataUrl(blob);
        setPending((p) => [...p, {
          kind: "audio",
          id: `aud-${Date.now()}`,
          dataUrl: url,
          mime,
          durationMs: Date.now() - audioStartRef.current,
        }]);
      };
      mediaRecRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Não foi possível aceder ao microfone.");
    }
  }

  function removeAttachment(id: string) {
    setPending((p) => p.filter((a) => a.id !== id));
  }

  /* ----------------------------------------------- send / stream ----- */

  async function handleSend() {
    const text = input.trim();
    if ((!text && pending.length === 0) || busy) return;
    if (!workspaceId) {
      toast.error("Workspace ativo não encontrado.");
      return;
    }

    const userBubble: Bubble = {
      id: `u-${Date.now()}`,
      from: "user",
      text,
      attachments: pending.length ? pending : undefined,
      at: Date.now(),
    };
    setBubbles((b) => [...b, userBubble]);
    setInput("");
    const sentAttachments = pending;
    setPending([]);

    // Build OpenAI-style multimodal content for the outgoing turn
    const parts: ContentPart[] = [];
    if (text) parts.push({ type: "text", text });
    for (const a of sentAttachments) {
      if (a.kind === "image") {
        parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
      } else if (a.kind === "audio") {
        const { b64 } = dataUrlToBase64(a.dataUrl);
        parts.push({
          type: "input_audio",
          input_audio: { data: b64, format: a.mime.includes("webm") ? "webm" : "mp4" },
        });
      }
    }
    // Always send at least an empty text so the assistant has a textual cue
    if (!parts.some((p) => p.type === "text")) {
      parts.unshift({ type: "text", text: "(Analisa os anexos.)" });
    }

    const history: ConvTurn[] = [
      ...bubbles
        .filter((b) => !b.pending && (b.text || b.attachments?.length))
        .slice(-10)
        .map<ConvTurn>((b) => ({
          role: b.from === "user" ? "user" : "assistant",
          content: b.text,
        })),
      { role: "user", content: parts },
    ];

    const streamId = `a-${Date.now()}`;
    setBubbles((b) => [...b, {
      id: streamId, from: "agent", text: "", at: Date.now(), pending: true,
    }]);
    setBusy(true);
    let acc = "";
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await streamMultimodalReply({
        history,
        context: {
          route: ctx.pathname,
          module: ctx.label,
          online: ctx.online,
          workspaceId,
          signals,
          recentEvents: recent,
          attachRuntimeSnapshot: autoAttachSnapshot,
          errorAttachments,
        },
        signal: ctrl.signal,
        onDelta: (chunk) => {
          acc += chunk;
          setBubbles((b) => b.map((x) => x.id === streamId
            ? { ...x, text: acc, pending: false } : x));
        },
        onDone: () => {
          if (!acc) {
            setBubbles((b) => b.map((x) => x.id === streamId
              ? { ...x, text: "Sem resposta. Tenta de novo.", pending: false } : x));
          }
        },
      });
    } catch (err) {
      const msg = err instanceof RateLimitedError
        ? "⏱ Aguarda um instante antes de enviar outra mensagem."
        : err instanceof Error ? `⚠ ${err.message}` : "⚠ Falha no agente.";
      setBubbles((b) => b.map((x) => x.id === streamId
        ? { ...x, text: msg, pending: false } : x));
      if (err instanceof RateLimitedError) toast.warning(msg);
      else toast.error(msg);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  /* ---------------------------------------------------------- render -- */

  return (
    <div className={cn("flex flex-col h-full min-h-0", className)}>
      {/* Context toggles */}
      <div className="px-3 py-2 border-b border-[hsl(195_100%_60%/0.12)] bg-black/30 flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/50">
        <button
          type="button"
          onClick={() => setAttachErrors((v) => !v)}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded border transition",
            attachErrors
              ? "border-destructive/50 text-destructive bg-destructive/10"
              : "border-white/10 hover:border-white/30 hover:text-white/80",
          )}
        >
          <AlertOctagon className="h-3 w-3" />
          Anexar erros
          {attachErrors && errorAttachments ? ` (${errorAttachments.length})` : ""}
        </button>
        <div className={cn(
          "flex items-center gap-1 px-2 py-1 rounded border",
          autoAttachSnapshot
            ? "border-[hsl(195_100%_60%/0.4)] text-[hsl(195_100%_75%)] bg-[hsl(195_100%_60%/0.08)]"
            : "border-white/10",
        )}>
          <Activity className="h-3 w-3" />
          Snapshot {autoAttachSnapshot ? "ativo" : "off"}
        </div>
      </div>

      {/* Bubbles */}
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3"
      >
        {bubbles.length === 0 && (
          <div className="text-center text-[11px] text-white/40 py-8 px-4">
            Anexa um screenshot, descreve o que vês, ou pede para analisar o estado atual.
            <br />
            <span className="text-white/30">
              Este agente é técnico/operacional — não responde a perguntas genéricas.
            </span>
          </div>
        )}
        {bubbles.map((b) => (
          <div key={b.id} className={cn("max-w-[92%]", b.from === "user" ? "ml-auto" : "")}>
            {b.attachments?.length ? (
              <div className={cn(
                "flex flex-wrap gap-1.5 mb-1",
                b.from === "user" ? "justify-end" : "",
              )}>
                {b.attachments.map((a) => (
                  <AttachmentChip key={a.id} att={a} compact />
                ))}
              </div>
            ) : null}
            <div
              className={cn(
                "rounded-2xl px-3 py-2 text-sm leading-snug whitespace-pre-wrap",
                b.from === "agent"
                  ? "bg-[hsl(220_50%_10%/0.9)] border border-[hsl(195_100%_60%/0.2)] text-white/90 rounded-bl-sm"
                  : "bg-[hsl(195_90%_45%)] text-[hsl(220_60%_6%)] rounded-br-sm font-medium",
              )}
            >
              {b.pending ? (
                <span className="inline-flex items-center gap-1.5 text-white/60">
                  <Loader2 className="h-3 w-3 animate-spin" /> a analisar…
                </span>
              ) : (b.text || (b.attachments?.length ? "(anexos enviados)" : ""))}
            </div>
            <div className={cn(
              "text-[9px] text-white/30 mt-0.5 px-1",
              b.from === "user" ? "text-right" : "",
            )}>
              {formatTime(b.at)}
            </div>
          </div>
        ))}
      </div>

      {/* Pending attachments preview */}
      {pending.length > 0 && (
        <div className="px-3 py-2 border-t border-[hsl(195_100%_60%/0.1)] bg-black/30 flex flex-wrap gap-2">
          {pending.map((a) => (
            <AttachmentChip key={a.id} att={a} onRemove={() => removeAttachment(a.id)} />
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="p-2 border-t border-[hsl(195_100%_60%/0.15)] bg-black/40 flex items-end gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePickImage}
        />
        <button
          type="button"
          aria-label="Anexar imagem"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="h-9 w-9 shrink-0 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition disabled:opacity-30"
        >
          <ImageIcon className="h-4 w-4" />
        </button>

        <button
          type="button"
          aria-label={recording ? "Parar gravação" : "Gravar áudio"}
          onClick={toggleRecording}
          disabled={busy}
          className={cn(
            "h-9 w-9 shrink-0 rounded-md flex items-center justify-center transition disabled:opacity-30",
            recording
              ? "bg-destructive/20 text-destructive animate-pulse"
              : "text-white/60 hover:text-white hover:bg-white/10",
          )}
        >
          {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>

        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder={busy ? "A analisar…" : "Descreve o problema, ou anexa um ecrã…"}
          disabled={busy}
          className={cn(
            "flex-1 resize-none bg-[hsl(220_50%_8%)] border border-[hsl(195_100%_60%/0.2)] rounded-md",
            "px-3 py-2 text-sm text-white placeholder:text-white/30",
            "focus:outline-none focus:ring-2 focus:ring-[hsl(195_100%_60%/0.4)] focus:border-[hsl(195_100%_60%/0.5)]",
            "max-h-32 disabled:opacity-60",
          )}
        />
        <button
          onClick={handleSend}
          disabled={(!input.trim() && pending.length === 0) || busy}
          aria-label="Enviar"
          className={cn(
            "h-9 w-9 shrink-0 rounded-md flex items-center justify-center",
            "bg-[hsl(195_100%_55%)] text-[hsl(220_60%_6%)] hover:bg-[hsl(195_100%_60%)]",
            "disabled:opacity-30 disabled:cursor-not-allowed transition-colors",
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function AttachmentChip({
  att, onRemove, compact = false,
}: { att: Attachment; onRemove?: () => void; compact?: boolean }) {
  if (att.kind === "image") {
    return (
      <div className={cn(
        "relative group rounded-md overflow-hidden border border-[hsl(195_100%_60%/0.3)]",
        compact ? "h-16 w-16" : "h-20 w-20",
      )}>
        <img src={att.dataUrl} alt={att.name} className="h-full w-full object-cover" />
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remover anexo"
            className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/70 hover:bg-destructive flex items-center justify-center transition"
          >
            <X className="h-3 w-3 text-white" />
          </button>
        )}
      </div>
    );
  }
  // audio
  return (
    <div className={cn(
      "relative flex items-center gap-2 px-2 py-1.5 rounded-md border bg-black/50",
      "border-[hsl(195_100%_60%/0.3)] text-[11px] text-white/80",
    )}>
      <Paperclip className="h-3 w-3 text-white/60" />
      Áudio · {Math.round(att.durationMs / 1000)}s
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover anexo"
          className="ml-1 h-4 w-4 rounded-full bg-black/70 hover:bg-destructive flex items-center justify-center"
        >
          <X className="h-3 w-3 text-white" />
        </button>
      )}
    </div>
  );
}

export default AgentConversationPanel;
