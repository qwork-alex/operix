import { useRef } from "react";
import { Camera, Mic, Square, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAudioRecorder, useMultimodal } from "./useMultimodal";
import { MultimodalDropZone } from "./MultimodalDropZone";
import type { MultimodalAnalysisResult, MultimodalAttachment } from "./types";

/**
 * Compact, embeddable multimodal control surface.
 * Drop it inside the agent panel, an incident view, or anywhere a
 * conversational technician needs to inspect screenshots/audio/files.
 */
export function MultimodalPanel({ className }: { className?: string }) {
  const { attachments, results, addFiles, takeScreenshot, remove, clear } =
    useMultimodal();
  const audio = useAudioRecorder();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleScreenshot = async () => {
    try {
      await takeScreenshot();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível capturar a tela",
      );
    }
  };

  const handleRecord = async () => {
    try {
      if (audio.recording) {
        await audio.stop();
      } else {
        await audio.start();
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Microfone indisponível",
      );
    }
  };

  return (
    <MultimodalDropZone className={className}>
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1.5" />
            Upload
          </Button>
          <Button size="sm" variant="outline" onClick={handleScreenshot}>
            <Camera className="h-4 w-4 mr-1.5" />
            Captura
          </Button>
          <Button
            size="sm"
            variant={audio.recording ? "destructive" : "outline"}
            disabled={!audio.supported}
            onClick={handleRecord}
          >
            {audio.recording ? (
              <>
                <Square className="h-4 w-4 mr-1.5" />
                Parar
              </>
            ) : (
              <>
                <Mic className="h-4 w-4 mr-1.5" />
                Gravar
              </>
            )}
          </Button>
          {attachments.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => clear()}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Limpar
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,audio/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files, "upload");
              e.target.value = "";
            }}
          />
        </div>

        {attachments.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            Arraste imagens ou áudio, cole da área de transferência, ou use os
            botões acima. O agente analisa automaticamente.
          </div>
        ) : (
          <ScrollArea className="max-h-64">
            <div className="space-y-2 pr-2">
              {attachments.map((att) => (
                <AttachmentRow
                  key={att.id}
                  att={att}
                  result={results.find((r) => r.attachmentId === att.id)}
                  onRemove={() => remove(att.id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </MultimodalDropZone>
  );
}

function AttachmentRow({
  att,
  result,
  onRemove,
}: {
  att: MultimodalAttachment;
  result?: MultimodalAnalysisResult;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-3 rounded-md border border-border/60 bg-card/40 p-2">
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded bg-muted/40 flex items-center justify-center">
        {att.previewUrl && (att.kind === "image" || att.kind === "screenshot") ? (
          <img
            src={att.previewUrl}
            alt={att.name}
            className="h-full w-full object-cover"
          />
        ) : att.kind === "audio" && att.previewUrl ? (
          <audio src={att.previewUrl} controls className="w-full scale-75" />
        ) : (
          <span className="text-[10px] text-muted-foreground px-1 text-center">
            {att.mime || att.kind}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium">{att.name}</span>
          <Badge variant="outline" className="h-4 px-1 text-[10px]">
            {att.source}
          </Badge>
          {result?.status === "running" && (
            <Badge className="h-4 px-1 text-[10px]">analisando…</Badge>
          )}
          {result?.status === "error" && (
            <Badge variant="destructive" className="h-4 px-1 text-[10px]">
              erro
            </Badge>
          )}
          <button
            className="ml-auto text-muted-foreground hover:text-foreground"
            onClick={onRemove}
            aria-label="Remover anexo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {result?.summary && (
          <p className="text-[11px] text-muted-foreground line-clamp-2">
            {result.summary}
          </p>
        )}
        {result?.transcript && (
          <p className="text-[11px] italic text-muted-foreground line-clamp-2">
            "{result.transcript}"
          </p>
        )}
        {!!result?.findings?.length && (
          <ul className="space-y-0.5">
            {result.findings.slice(0, 3).map((f, i) => (
              <li
                key={i}
                className={
                  "text-[11px] " +
                  (f.severity === "critical" || f.severity === "error"
                    ? "text-destructive"
                    : f.severity === "warning"
                      ? "text-amber-500"
                      : "text-muted-foreground")
                }
              >
                • {f.title}
              </li>
            ))}
          </ul>
        )}
        {!!result?.correlations?.length && (
          <p className="text-[10px] text-muted-foreground/80">
            ↳ {result.correlations.map((c) => c.label).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
