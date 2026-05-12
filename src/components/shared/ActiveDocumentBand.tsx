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
  children: ReactNode; // OCR / editor (rendered BELOW document)
  className?: string;
}

/**
 * Phase C.3 — Continuous OCR validation station.
 * Vertical flow: thin workflow strip → dominant document preview → OCR below.
 * No left/right rigid split. No mini-preview. Document is the dominant element.
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
    { key: "validate", label: "Validar",  icon: CheckCircle2 },
    { key: "save",     label: "Salvar",   icon: Save },
  ];
  const currentIdx = stages.findIndex(s => s.key === stage);

  return (
    <section className={cn("flex flex-col border-b border-border/40 bg-background", className)}>
      {/* BARRA CONTEXTUAL FINA — workflow + ferramentas documentais */}
      <div className="flex items-center justify-between gap-3 border-b border-border/40 bg-card/30 px-4 h-9">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-foreground truncate" title={file?.name}>
            {file?.name ?? "Documento ativo"}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-1">
          {stages.map((s, i) => {
            const Icon = s.icon;
            const done = i < currentIdx || s.key === "enviado";
            const active = i === currentIdx;
            return (
              <div key={s.key} className="flex items-center gap-1">
                {i > 0 && <div className={cn("h-px w-3", done ? "bg-primary" : "bg-border")} />}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    active && "text-primary",
                    done && !active && "text-primary/70",
                    !active && !done && "text-muted-foreground",
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
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(z => Math.max(0.4, z - 0.2))} title="Zoom out">
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(z => Math.min(3, z + 0.2))} title="Zoom in">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              {isImage && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRotation(r => (r + 90) % 360)} title="Girar">
                  <RotateCw className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handlePrint} title="Imprimir">
                <Printer className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} title="Fechar">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* DOCUMENTO — elemento dominante, persistente, vertical */}
      <div className="bg-muted/10 overflow-auto flex items-start justify-center p-4 min-h-[55vh] max-h-[70vh]">
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
            className="w-full h-[65vh] border-0"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
          />
        )}
        {!objectUrl && (
          <div className="text-xs text-muted-foreground py-8">Pré-visualização indisponível</div>
        )}
      </div>

      {/* OCR / VALIDAÇÃO — abaixo do documento, fluxo contínuo */}
      <div className="border-t border-border/40">
        {children}
      </div>
    </section>
  );
}
