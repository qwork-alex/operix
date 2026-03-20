import { useCallback, useState } from "react";
import { Upload, FileText, Image, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
}

const ACCEPTED = ".pdf,.jpg,.jpeg,.png,.webp,.heic";

export function FileUploadZone({ onFilesSelected, isProcessing }: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        /\.(pdf|jpe?g|png|webp|heic)$/i.test(f.name)
      );
      if (files.length) onFilesSelected(files);
    },
    [onFilesSelected]
  );

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) onFilesSelected(files);
    e.target.value = "";
  };

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all duration-300",
        isDragOver
          ? "border-primary bg-primary/5 scale-[1.01]"
          : "border-border/60 hover:border-primary/50 hover:bg-card/50",
        isProcessing && "pointer-events-none opacity-60"
      )}
    >
      <input
        type="file"
        accept={ACCEPTED}
        multiple
        onChange={handleInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isProcessing}
      />

      {isProcessing ? (
        <>
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="text-sm font-medium text-foreground">Extracting data with AI…</p>
          <p className="text-xs text-muted-foreground">This may take a few seconds</p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Drop files here or click to upload
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, JPG, PNG — service order documents
            </p>
          </div>
          <div className="flex gap-2 mt-1">
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded">
              <FileText className="h-3 w-3" /> PDF
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded">
              <Image className="h-3 w-3" /> Images
            </span>
          </div>
        </>
      )}
    </label>
  );
}
