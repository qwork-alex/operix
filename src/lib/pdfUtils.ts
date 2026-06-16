/**
 * PDF utilities — pdf.js wrapper for safe in-app rendering.
 * Avoids iframe (Chrome blocks blob: PDF in iframe under strict CSP).
 */
import * as pdfjs from "pdfjs-dist";

// Use the bundled worker as a URL — Vite handles this transform.
// (Worker file ships with pdfjs-dist v4+.)
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export async function renderPdfFirstPageToCanvas(
  file: File | Blob,
  canvas: HTMLCanvasElement,
  opts: { maxWidth?: number } = {}
): Promise<{ width: number; height: number; pageCount: number }> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const page = await pdf.getPage(1);

  const baseViewport = page.getViewport({ scale: 1 });
  const maxW = opts.maxWidth ?? 1100;
  const scale = Math.min(2.0, maxW / baseViewport.width);
  const viewport = page.getViewport({ scale });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  await page.render({ canvasContext: ctx, viewport }).promise;
  return { width: canvas.width, height: canvas.height, pageCount: pdf.numPages };
}

/** Render first page of a PDF as a JPEG dataURL (used for OCR thumbnail). */
export async function pdfFirstPageToImageBase64(
  file: File | Blob,
  opts: { maxWidth?: number; quality?: number } = {}
): Promise<{ base64: string; mimeType: "image/jpeg" }> {
  const off = document.createElement("canvas");
  await renderPdfFirstPageToCanvas(file, off, { maxWidth: opts.maxWidth ?? 1600 });
  const dataUrl = off.toDataURL("image/jpeg", opts.quality ?? 0.92);
  const base64 = dataUrl.split(",")[1] ?? "";
  return { base64, mimeType: "image/jpeg" };
}

export async function pdfPagesToImageBase64(
  file: File | Blob,
  opts: { maxWidth?: number; quality?: number; maxPages?: number } = {}
): Promise<Array<{ base64: string; mimeType: "image/jpeg"; pageNumber: number }>> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const maxPages = Math.min(pdf.numPages, opts.maxPages ?? 5);
  const pages: Array<{ base64: string; mimeType: "image/jpeg"; pageNumber: number }> = [];

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const maxW = opts.maxWidth ?? 1600;
    const scale = Math.min(2.0, maxW / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", opts.quality ?? 0.9);
    pages.push({
      base64: dataUrl.split(",")[1] ?? "",
      mimeType: "image/jpeg",
      pageNumber,
    });
  }

  return pages;
}

export async function fileToBase64(file: File | Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
