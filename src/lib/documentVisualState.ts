export type DocumentVisualState = {
  displayName: string;
  rotation: number;
  zoom: number;
  validated?: boolean;
  updatedAt?: string;
};

export function normalizeRotation(value?: number | null) {
  const rotation = Number(value ?? 0);
  if (!Number.isFinite(rotation)) return 0;
  return ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
}

export function getDocumentDisplayName(doc: any) {
  return (doc?.display_name || doc?.visual_state?.displayName || doc?.name || "Documento ativo") as string;
}

export function getDocumentRotation(doc: any) {
  return normalizeRotation(doc?.rotation ?? doc?.visual_state?.rotation);
}

export function getDocumentZoom(doc: any) {
  const zoom = Number(doc?.zoom ?? doc?.visual_state?.zoom ?? 1);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

export function stateFromDocument(doc: any, fallbackName?: string): DocumentVisualState {
  return {
    displayName: getDocumentDisplayName(doc) || fallbackName || "Documento ativo",
    rotation: getDocumentRotation(doc),
    zoom: getDocumentZoom(doc),
    validated: Boolean(doc?.validated ?? doc?.visual_state?.validated),
    updatedAt: doc?.updated_at ?? doc?.visual_state?.updatedAt,
  };
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível preparar a imagem do documento."));
    };
    img.src = url;
  });
}

export async function rotateImageBlob(blob: Blob, rotationInput: number, mimeType?: string): Promise<Blob> {
  const rotation = normalizeRotation(rotationInput);
  if (rotation === 0 || !blob.type.startsWith("image/")) return blob;

  const img = await loadImageFromBlob(blob);
  const quarterTurn = rotation === 90 || rotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = quarterTurn ? img.naturalHeight : img.naturalWidth;
  canvas.height = quarterTurn ? img.naturalWidth : img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a rotação do documento.");

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (out) => out ? resolve(out) : reject(new Error("Não foi possível gerar o documento rotacionado.")),
      mimeType || blob.type || "image/png",
      0.95,
    );
  });
}

export async function fileForCurrentVisualState(file: File, state: DocumentVisualState): Promise<File> {
  const rotation = normalizeRotation(state.rotation);
  if (!file.type.startsWith("image/") || rotation === 0) return file;
  const rotated = await rotateImageBlob(file, rotation, file.type);
  return new File([rotated], state.displayName || file.name, { type: rotated.type || file.type, lastModified: Date.now() });
}