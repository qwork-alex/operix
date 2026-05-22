/**
 * Lightweight screenshot helper. Uses the Screen Capture API when available
 * (requires a user gesture). Returns a PNG Blob ready for the pipeline.
 */
export async function captureScreenshot(): Promise<Blob> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen Capture API indisponível neste navegador.");
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 1 },
    audio: false,
  });
  try {
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("Nenhum track de vídeo disponível.");

    // Prefer ImageCapture when available
    const ImageCaptureCtor =
      (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => unknown })
        .ImageCapture;
    if (ImageCaptureCtor) {
      const capture = new ImageCaptureCtor(track) as {
        grabFrame: () => Promise<ImageBitmap>;
      };
      const bitmap = await capture.grabFrame();
      return bitmapToPng(bitmap);
    }

    // Fallback: render the stream into a <video>, draw to canvas.
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    await new Promise((r) => setTimeout(r, 150));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context indisponível.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))),
        "image/png",
      ),
    );
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

async function bitmapToPng(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context indisponível.");
  ctx.drawImage(bitmap, 0, 0);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))),
      "image/png",
    ),
  );
}
