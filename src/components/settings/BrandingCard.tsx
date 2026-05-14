import { useCallback, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { Camera, ImageIcon, Loader2, Trash2, Upload, Building2 } from "lucide-react";
import { toast } from "sonner";

const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,image/svg+xml";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_DIM = 512;

/**
 * Process raster images: resize down to MAX_DIM keeping aspect ratio,
 * trim transparent padding (basic auto-crop), export as PNG.
 * SVGs are passed through untouched.
 */
async function processImage(file: File): Promise<File> {
  if (file.type === "image/svg+xml") return file;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  // Auto-crop: detect bounding box of non-transparent (or non-white) pixels
  const work = document.createElement("canvas");
  work.width = img.naturalWidth;
  work.height = img.naturalHeight;
  const wctx = work.getContext("2d")!;
  wctx.drawImage(img, 0, 0);

  let minX = work.width, minY = work.height, maxX = 0, maxY = 0;
  try {
    const data = wctx.getImageData(0, 0, work.width, work.height).data;
    let found = false;
    for (let y = 0; y < work.height; y++) {
      for (let x = 0; x < work.width; x++) {
        const i = (y * work.width + x) * 4;
        const a = data[i + 3];
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const isBg = a < 8 || (a > 240 && r > 248 && g > 248 && b > 248);
        if (!isBg) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          found = true;
        }
      }
    }
    if (!found) { minX = 0; minY = 0; maxX = work.width - 1; maxY = work.height - 1; }
  } catch {
    minX = 0; minY = 0; maxX = work.width - 1; maxY = work.height - 1;
  }

  const cw = Math.max(1, maxX - minX + 1);
  const ch = Math.max(1, maxY - minY + 1);
  const scale = Math.min(1, MAX_DIM / Math.max(cw, ch));
  const outW = Math.round(cw * scale);
  const outH = Math.round(ch * scale);

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(work, minX, minY, cw, ch, 0, 0, outW, outH);

  const blob = await new Promise<Blob | null>((res) =>
    out.toBlob((b) => res(b), "image/png", 0.92)
  );
  if (!blob) return file;
  return new File([blob], "logo.png", { type: "image/png" });
}

export function BrandingCard() {
  const { logoUrl, isLoading, uploadLogo, isUploading, removeLogo, isRemoving } = useCompanyLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) {
      toast.error("Formato não suportado. Use PNG, JPG, WEBP ou SVG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Ficheiro demasiado grande (máx. 5MB).");
      return;
    }
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    try {
      const processed = await processImage(file);
      await uploadLogo(processed);
      toast.success("Logótipo atualizado");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar logótipo");
    } finally {
      setTimeout(() => URL.revokeObjectURL(localPreview), 2000);
      setPreviewUrl(null);
    }
  }, [uploadLogo]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const displayUrl = previewUrl || logoUrl;

  return (
    <Card className="border-border/50 lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          Branding · Logótipo da empresa
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-start">
          {/* Preview */}
          <div className="flex flex-col items-center gap-2">
            <div className="h-[160px] w-[160px] rounded-xl border border-border/60 bg-white flex items-center justify-center overflow-hidden shadow-sm">
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : displayUrl ? (
                <img
                  src={displayUrl}
                  alt="Logótipo"
                  className="max-h-full max-w-full object-contain p-3"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <Building2 className="h-8 w-8 opacity-50" />
                  <span className="text-[10px] uppercase tracking-wide">Sem logótipo</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              PNG, JPG, WEBP ou SVG · até 5MB
            </p>
          </div>

          {/* Dropzone + actions */}
          <div className="space-y-3">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border/60 hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Arraste uma imagem ou clique para enviar</p>
              <p className="text-xs text-muted-foreground mt-1">
                Será otimizada automaticamente (auto-crop · 512px)
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isRemoving}
              >
                <ImageIcon className="h-4 w-4 mr-1.5" />
                Galeria
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isUploading || isRemoving}
              >
                <Camera className="h-4 w-4 mr-1.5" />
                Câmara
              </Button>
              {logoUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeLogo().then(() => toast.success("Logótipo removido")).catch((e) => toast.error(e?.message || "Erro"))}
                  disabled={isUploading || isRemoving}
                >
                  {isRemoving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
                  Remover
                </Button>
              )}
              {isUploading && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> A processar e enviar…
                </span>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              O logótipo aparece automaticamente nas <strong>faturas</strong> (preview, impressão e PDF) e em
              comunicações por <strong>email</strong>. Se nenhum logótipo for definido, é usado um placeholder
              elegante.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
