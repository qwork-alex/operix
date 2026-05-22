import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMultimodal } from "./useMultimodal";

interface Props {
  children?: ReactNode;
  className?: string;
  /** Accept any file in addition to images/audio. */
  acceptAll?: boolean;
  onAdded?: (count: number) => void;
}

/**
 * Drag-and-drop + paste capture surface for the multimodal pipeline.
 * Renders children inside; the drop overlay only activates while dragging.
 */
export function MultimodalDropZone({ children, className, acceptAll, onAdded }: Props) {
  const { addFiles } = useMultimodal();
  const [over, setOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      await addFiles(list, "drag-drop");
      onAdded?.(list.length);
    },
    [addFiles, onAdded],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.files;
      if (items && items.length) handleFiles(items);
    },
    [handleFiles],
  );

  return (
    <div
      className={cn("relative", className)}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      {children}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptAll ? undefined : "image/*,audio/*"}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {over && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary/60 bg-background/80 backdrop-blur-sm">
          <span className="text-sm text-muted-foreground">
            Solte arquivos para analisar
          </span>
        </div>
      )}
    </div>
  );
}
