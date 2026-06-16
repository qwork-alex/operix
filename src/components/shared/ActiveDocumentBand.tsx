import { useEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import {
  ZoomIn, ZoomOut, RotateCw, Undo2, Printer, X, FileText, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fileForCurrentVisualState, normalizeRotation, type DocumentVisualState } from "@/lib/documentVisualState";

export type DocStage = "review" | "validate" | "save";

interface Props {
  file?: File | null;
  stage?: DocStage;
  onClose: () => void;
  initialState?: Partial<DocumentVisualState>;
  onStateChange?: (state: DocumentVisualState) => void;
  onPersistState?: (state: DocumentVisualState) => Promise<void> | void;
  onReprocessOcr?: (state: DocumentVisualState) => Promise<void> | void;
  isReprocessing?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Phase C.4 — Minimal top bar, inline-editable name, smart zoom-out.
 * Zoom-out shrinks the preview area, redistributing height to OCR below.
 */
export function ActiveDocumentBand({ file, onClose, initialState, onStateChange, onPersistState, onReprocessOcr, isReprocessing, children, className }: Props) {
  const [zoom, setZoom] = useState(initialState?.zoom ?? 1);
  const [rotation, setRotation] = useState(normalizeRotation(initialState?.rotation));
  const [name, setName] = useState(initialState?.displayName ?? file?.name ?? "Documento ativo");
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(initialState?.displayName ?? file?.name ?? "Documento ativo");
    setRotation(normalizeRotation(initialState?.rotation));
    setZoom(initialState?.zoom ?? 1);
  }, [file?.name, initialState?.displayName, initialState?.rotation, initialState?.zoom]);

  const currentState = useMemo<DocumentVisualState>(() => ({
    displayName: name.trim() || file?.name || "Documento ativo",
    rotation: normalizeRotation(rotation),
    zoom,
    updatedAt: new Date().toISOString(),
  }), [file?.name, name, rotation, zoom]);

  useEffect(() => { onStateChange?.(currentState); }, [currentState, onStateChange]);

  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);

  const isImage = file?.type.startsWith("image/");
  const isPdf = file?.type === "application/pdf";

  const handlePrint = async () => {
    if (!file) return;
    const visualFile = await fileForCurrentVisualState(file, currentState);
    const printUrl = URL.createObjectURL(visualFile);
    const w = window.open(printUrl, "_blank");
    if (w) w.addEventListener("load", () => w.print());
    window.setTimeout(() => URL.revokeObjectURL(printUrl), 300000);
  };

  const persist = (state: DocumentVisualState) => {
    onStateChange?.(state);
    onPersistState?.(state);
  };

  // SMART ZOOM-OUT: preview height collapses with zoom < 1; zoom-in keeps full height.
  // Base 55vh -> 70vh max. When zoom < 1, shrink down to a floor so OCR/table can breathe.
  const previewMinVh = zoom >= 1 ? 55 : Math.max(20, Math.round(55 * zoom));
  const previewMaxVh = zoom >= 1 ? 70 : Math.max(24, Math.round(70 * zoom));

  const startEdit = () => {
    setEditing(true);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  };
  const commit = () => {
    const trimmed = name.trim() || (file?.name ?? "Documento ativo");
    setName(trimmed);
    setEditing(false);
    persist({ ...currentState, displayName: trimmed, updatedAt: new Date().toISOString() });
  };
  const cancel = () => {
    setName(file?.name ?? "Documento ativo");
    setEditing(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancel(); }
  };

  return (
    <section className={cn("flex flex-col border-b border-border/40 bg-background", className)}>
      {/* TOP BAR — minimal: name + zoom controls + print + close */}
      <div className="flex items-center justify-between gap-3 border-b border-border/40 bg-card/30 px-4 h-9">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {editing ? (
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commit}
              onKeyDown={onKey}
              className="bg-transparent border-b border-primary/60 outline-none text-xs font-medium text-foreground px-0.5 py-0 flex-1 min-w-0"
            />
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="text-xs font-medium text-foreground truncate text-left hover:text-primary transition-colors"
              title="Clique para renomear"
            >
              {name}
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {(isImage || isPdf) && (
            <>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(z => Math.max(0.4, z - 0.2))} title="Zoom out">
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(z => Math.min(3, z + 0.2))} title="Zoom in">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setZoom(1); persist({ ...currentState, zoom: 1 }); }} title="Reset zoom">
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRotation(r => { const next = (r + 90) % 360; persist({ ...currentState, rotation: next }); return next; })} title="Girar documento">
                <RotateCw className="h-3.5 w-3.5" />
              </Button>
              {onReprocessOcr && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onReprocessOcr(currentState)} title="Reprocessar OCR" disabled={isReprocessing}>
                  <RefreshCw className={cn("h-3.5 w-3.5", isReprocessing && "animate-spin")} />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handlePrint} title="Imprimir">
                <Printer className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} title="Fechar preview">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* DOCUMENT — preview shrinks on zoom-out, freeing space for OCR */}
      <div
        className="bg-muted/10 overflow-auto flex items-start justify-center p-4 transition-[min-height,max-height] duration-200"
        style={{ minHeight: `${previewMinVh}vh`, maxHeight: `${previewMaxVh}vh` }}
      >
        {objectUrl && isImage && (
          <img
            src={objectUrl}
            alt={name}
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transformOrigin: "center center" }}
            className="max-w-full max-h-full transition-transform object-contain"
          />
        )}
        {objectUrl && isPdf && (
          <iframe
            src={objectUrl}
            title={name}
            className="w-full h-full border-0 min-h-[40vh]"
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transformOrigin: "center center" }}
          />
        )}
        {!objectUrl && (
          <div className="text-xs text-muted-foreground py-8">Pré-visualização indisponível</div>
        )}
      </div>

      {/* OCR / VALIDATION below */}
      <div className="border-t border-border/40">
        {children}
      </div>
    </section>
  );
}
