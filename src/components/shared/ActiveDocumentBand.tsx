import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ZoomIn, ZoomOut, RotateCw, Printer, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExtractionStages, type Stage } from "@/components/service-orders/ExtractionStages";
import { cn } from "@/lib/utils";

interface Props {
  file?: File | null;
  stage: Stage;
  onClose: () => void;
  children: ReactNode; // editor (ExtractedDataTable / ExtractedPaymentTable)
  className?: string;
}

/**
 * Active document workspace band — appears inline above tables when a document
 * is being processed. Left: preview/editor. Right: workflow stages + actions.
 * Disappears automatically when extraction list empties (parent controls).
 */
export function ActiveDocumentBand({ file, stage, onClose, children, className }: Props) {
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

  return (
    <section
      className={cn(
        "border-b border-border/40 bg-card/30 flex flex-col",
        "max-h-[58vh] min-h-[280px]",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-border/30 px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-foreground truncate">
            {file?.name ?? "Documento ativo"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ExtractionStages current={stage} />
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
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePrint} title="Print">
                  <Printer className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Fechar">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Body: preview | editor */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(260px,38%)_1fr]">
        <div className="hidden lg:flex border-r border-border/30 bg-muted/20 overflow-auto items-start justify-center p-2">
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
