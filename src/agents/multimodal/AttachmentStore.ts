import type { MultimodalAttachment, MultimodalKind, MultimodalSource } from "./types";

type Listener = (items: MultimodalAttachment[]) => void;

const MAX_ITEMS = 24;

function uid() {
  return `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function inferKind(file: { type: string; name: string }, source: MultimodalSource): MultimodalKind {
  if (source === "screenshot") return "screenshot";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return "text";
}

class AttachmentStoreImpl {
  private items: MultimodalAttachment[] = [];
  private listeners = new Set<Listener>();

  list(): MultimodalAttachment[] {
    return this.items.slice();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.list());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    const snapshot = this.list();
    this.listeners.forEach((l) => {
      try {
        l(snapshot);
      } catch {
        /* ignore */
      }
    });
  }

  add(
    blob: Blob,
    opts: {
      name?: string;
      source: MultimodalSource;
      durationSec?: number;
      meta?: Record<string, unknown>;
    },
  ): MultimodalAttachment {
    const name = opts.name ?? `asset-${Date.now()}`;
    const mime = blob.type || "application/octet-stream";
    const kind = inferKind({ type: mime, name }, opts.source);
    const previewUrl =
      kind === "image" || kind === "screenshot" || kind === "audio"
        ? URL.createObjectURL(blob)
        : undefined;

    const att: MultimodalAttachment = {
      id: uid(),
      kind,
      source: opts.source,
      name,
      mime,
      size: blob.size,
      blob,
      previewUrl,
      durationSec: opts.durationSec,
      createdAt: Date.now(),
      meta: opts.meta,
    };

    this.items = [att, ...this.items].slice(0, MAX_ITEMS);
    this.emit();
    return att;
  }

  remove(id: string) {
    const target = this.items.find((i) => i.id === id);
    if (target?.previewUrl) {
      try {
        URL.revokeObjectURL(target.previewUrl);
      } catch {
        /* ignore */
      }
    }
    this.items = this.items.filter((i) => i.id !== id);
    this.emit();
  }

  get(id: string): MultimodalAttachment | undefined {
    return this.items.find((i) => i.id === id);
  }

  clear() {
    this.items.forEach((i) => {
      if (i.previewUrl) {
        try {
          URL.revokeObjectURL(i.previewUrl);
        } catch {
          /* ignore */
        }
      }
    });
    this.items = [];
    this.emit();
  }
}

export const AttachmentStore = new AttachmentStoreImpl();
