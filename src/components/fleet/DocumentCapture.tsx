import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Upload, Camera, ScanLine, Loader2, X, SwitchCamera, Minus } from "lucide-react";

interface DocumentCaptureProps {
  onFileReady: (file: File) => void;
  disabled?: boolean;
  extracting?: boolean;
  label?: string;
}

export default function DocumentCapture({ onFileReady, disabled, extracting, label = "Importar dados do documento" }: DocumentCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<"photo" | "scan">("photo");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const startCamera = useCallback(async (mode: "photo" | "scan", facing?: "environment" | "user") => {
    setCameraMode(mode);
    setCameraError(null);
    setCameraOpen(true);

    const useFacing = facing || facingMode;

    // Stop existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: useFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error("[DocumentCapture] Camera error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NotAllowed") || msg.includes("Permission")) {
        setCameraError("Permissão da câmara negada. Verifique as definições do navegador.");
      } else if (msg.includes("NotFound") || msg.includes("DevicesNotFound")) {
        setCameraError("Nenhuma câmara encontrada neste dispositivo.");
      } else {
        setCameraError(`Erro ao aceder à câmara: ${msg}`);
      }
    }
  }, [facingMode]);

  const toggleCamera = useCallback(async () => {
    const newFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newFacing);
    if (cameraOpen) {
      await startCamera(cameraMode, newFacing);
    }
  }, [facingMode, cameraOpen, cameraMode, startCamera]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
    setCameraError(null);
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
      if (cameraMode === "photo") {
        stopCamera();
      }
      onFileReady(file);
    }, "image/jpeg", 0.92);
  }, [cameraMode, onFileReady, stopCamera]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (cameraOpen && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen]);

  return (
    <>
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-3">
        <p className="text-xs font-semibold text-muted-foreground mb-2">📄 {label}</p>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm" className="flex-1 h-8 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || extracting}
          >
            <Upload className="h-3 w-3 mr-1" /> Ficheiro
          </Button>
          <Button
            variant="outline" size="sm" className="flex-1 h-8 text-xs"
            onClick={() => startCamera("photo")}
            disabled={disabled || extracting}
          >
            <Camera className="h-3 w-3 mr-1" /> Foto
          </Button>
          <Button
            variant="outline" size="sm" className="flex-1 h-8 text-xs"
            onClick={() => startCamera("scan")}
            disabled={disabled || extracting}
          >
            <ScanLine className="h-3 w-3 mr-1" /> Scan
          </Button>
        </div>
        {extracting && (
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Extraindo dados do documento...
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onFileReady(f);
          e.target.value = "";
        }}
      />

      <Dialog open={cameraOpen} onOpenChange={(o) => { if (!o) stopCamera(); }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>{cameraMode === "scan" ? "Modo Scan" : "Tirar Foto"}</DialogTitle>
            <DialogDescription>
              {cameraMode === "scan"
                ? "Posicione o documento e clique em Capturar. Pode capturar várias imagens."
                : "Posicione o documento e clique em Capturar."}
            </DialogDescription>
          </DialogHeader>

          {cameraError ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm text-destructive">{cameraError}</p>
              <p className="text-xs text-muted-foreground">
                Tente usar a opção "Ficheiro" para selecionar uma imagem da galeria.
              </p>
              <Button variant="outline" onClick={stopCamera}>Fechar</Button>
            </div>
          ) : (
            <>
              <div className="relative bg-black aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {cameraMode === "scan" && (
                  <div className="absolute inset-8 border-2 border-white/40 rounded-lg pointer-events-none" />
                )}
              </div>
              <div className="flex items-center justify-between p-4">
                <Button variant="ghost" size="sm" onClick={stopCamera}>
                  <X className="h-4 w-4 mr-1" /> Fechar
                </Button>
                <Button variant="outline" size="sm" onClick={toggleCamera}>
                  <SwitchCamera className="h-4 w-4 mr-1" />
                  {facingMode === "environment" ? "Frontal" : "Traseira"}
                </Button>
                <Button onClick={captureFrame} disabled={extracting}>
                  <Camera className="h-4 w-4 mr-1" />
                  {cameraMode === "scan" ? "Capturar" : "Tirar Foto"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <canvas ref={canvasRef} className="hidden" />
    </>
  );
}
