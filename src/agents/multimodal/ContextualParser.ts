/**
 * Reads lightweight, non-invasive context about the current UI:
 * route, viewport, visible landmarks, and obvious error/empty states.
 * Used to enrich multimodal analysis hints.
 */
export interface UIContextSnapshot {
  route: string;
  viewport: { w: number; h: number; dpr: number };
  landmarks: string[];
  emptyStateDetected: boolean;
  errorTextSamples: string[];
  capturedAt: number;
}

export function captureUIContext(): UIContextSnapshot {
  const route =
    typeof window !== "undefined" ? window.location.pathname : "/";
  const viewport = {
    w: typeof window !== "undefined" ? window.innerWidth : 0,
    h: typeof window !== "undefined" ? window.innerHeight : 0,
    dpr: typeof window !== "undefined" ? window.devicePixelRatio : 1,
  };

  const landmarks: string[] = [];
  const errorTextSamples: string[] = [];
  let emptyStateDetected = false;

  if (typeof document !== "undefined") {
    document.querySelectorAll("h1, h2, [data-landmark]").forEach((el) => {
      const t = (el.textContent || "").trim();
      if (t && landmarks.length < 8) landmarks.push(t.slice(0, 80));
    });

    const ERROR_RX = /(erro|falha|failed|exception|timeout|offline)/i;
    document
      .querySelectorAll('[role="alert"], .text-destructive, [data-error="true"]')
      .forEach((el) => {
        const t = (el.textContent || "").trim();
        if (t && ERROR_RX.test(t) && errorTextSamples.length < 5) {
          errorTextSamples.push(t.slice(0, 160));
        }
      });

    const main = document.querySelector("main");
    if (main && (main.textContent || "").trim().length < 40) {
      emptyStateDetected = true;
    }
  }

  return {
    route,
    viewport,
    landmarks,
    emptyStateDetected,
    errorTextSamples,
    capturedAt: Date.now(),
  };
}
