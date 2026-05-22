/**
 * Screenshot Capture Framework — local-only, permission-gated.
 *
 * Uses the browser's getDisplayMedia API (user picks tab/window/screen).
 * No upload, no external service. Returns a data URL stored only in-memory
 * or in localStorage by the caller. Falls back to null when unsupported
 * or when the user denies permission.
 */

const LS_KEY = "qwork.agent.lastScreenshot.v1";

export async function captureScreenshot(): Promise<string | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      return null;
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1600 }, height: { ideal: 1000 } },
      audio: false,
    });
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    // give the first frame a tick to render
    await new Promise((r) => setTimeout(r, 120));

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }
    ctx.drawImage(video, 0, 0, w, h);
    stream.getTracks().forEach((t) => t.stop());
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    try {
      localStorage.setItem(LS_KEY, dataUrl);
    } catch {
      /* quota */
    }
    return dataUrl;
  } catch {
    return null;
  }
}

export function loadLastScreenshot(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

export function clearLastScreenshot() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}
