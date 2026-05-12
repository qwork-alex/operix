import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ZoomIn, ZoomOut, RotateCw, Printer, X, FileText, CheckCircle2, Pencil, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DocStage = "review" | "validate" | "save";

interface Props {
  file?: File | null;
  stage?: DocStage;
  onClose: () => void;
  children: ReactNode; // OCR / editor (right pane)
  className?: string;
}

/**
 * Continuous documental workspace — NOT a floating panel.
 * Renders inline above the operational tables and dominates vertical space
 * while a document is active. Layout: toolbar strip + horizontal split
 * (large preview LEFT, OCR / validation RIGHT).
 *
 * Stages: enviado (always done) → revisão → validado → salvar.
 */
export function ActiveDocumentBand({ file, stage = "review", onClose, children, className }: Props) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const isImage = file?.type.startsWith("image/");
  const isPdf = file?.type === "application/pdf";

  const handlePrint = () => {
    if (!objectUrl) return;
    const w = window.open(objectUrl, "_blank");
    if (w) w.addEventListener("load", () => w.print());
  };

  const stages: { key: "enviado" | DocStage; label: string; icon: typeof CheckCircle2 }[] = [
    { key: "enviado",  label: "Enviado",  icon: CheckCircle2 },
    { key: "review",   label: "Revisão",  icon: Pencil },
    { key: "validate", label: "Validado", icon: CheckCircle2 },
    { key: "save",     label: "Salvar",   icon: Save },
  ];
  const currentIdx = stages.findIndex(s => s.key === stage);

  return (
    <section
      className={cn(
        "flex flex-col border-b border-border/40 bg-background",
        // Dominant vertical presence — mesa documental, não mini-painel
        "flex-[2_1_0%] min-h-[60vh]",
        className,
      )}
    >
      {/* Toolbar contínua */}
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground truncate" title={file?.name}>
            {file?.name ?? "Documento ativo"}
          </span>
        </div>

        {/* Workflow inline (sem 'Enviar' button — já enviado) */}
        <div className="hidden md:flex items-center gap-1.5">
          {stages.map((s, i) => {
            const Icon = s.icon;
            const done = i < currentIdx || s.key === "enviado";
            const active = i === currentIdx;
            return (
              <div key={s.key} className="flex items-center gap-1.5">
                {i > 0 && <div className={cn("h-px w-5", done ? "bg-primary" : "bg-border")} />}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    active && "bg-primary text-primary-foreground",
                    done && !active && "bg-primary/10 text-primary",
                    !active && !done && "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-0.5">
          {(isImage || isPdf) && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.4, z - 0.2))} title="Zoom out">
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(3, z + 0.2))} title="Zoom in">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              {isImage && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRotation(r => (r + 90) % 360)} title="Rotate">
                  <RotateCw className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePrint} title="Imprimir">
                <Printer className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Fechar">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Corpo: preview grande à esquerda, OCR à direita */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(380px,55%)_1fr]">
        <div className="hidden lg:flex border-r border-border/40 bg-muted/10 overflow-auto items-start justify-center p-3">
          {objectUrl && isImage && (
            <img
              src={objectUrl}
              alt={file?.name}
              style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transformOrigin: "top center" }}
              className="max-w-full transition-transform"
            />
          )}
          {objectUrl && isPdf && (
            <iframe
              src={objectUrl}
              title={file?.name}
              className="w-full h-full border-0"
              style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
            />
          )}
          {!objectUrl && (
            <div className="text-xs text-muted-foreground py-8">Pré-visualização indisponível</div>
          )}
        </div>
        <div className="overflow-auto">
          {children}
        </div>
      </div>
    </section>
  );
}
