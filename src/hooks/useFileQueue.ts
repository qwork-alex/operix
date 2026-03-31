import { useState, useCallback, useRef } from "react";

export type QueueItemStatus = "pending" | "uploading" | "processing" | "completed" | "error";

export interface QueueItem {
  id: string;
  file: File;
  status: QueueItemStatus;
  error?: string;
}

export function useFileQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);

  const updateItem = (id: string, patch: Partial<QueueItem>) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q));
  };

  const processQueue = useCallback(async (
    items: QueueItem[],
    processor: (file: File, onStatus: (status: QueueItemStatus) => void) => Promise<void>
  ) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);

    for (const item of items) {
      if (item.status !== "pending") continue;
      try {
        await processor(item.file, (status) => updateItem(item.id, { status }));
        updateItem(item.id, { status: "completed" });
      } catch (err) {
        updateItem(item.id, { status: "error", error: (err as Error).message });
      }
    }

    processingRef.current = false;
    setIsProcessing(false);
  }, []);

  const addFiles = useCallback((
    files: File[],
    processor: (file: File, onStatus: (status: QueueItemStatus) => void) => Promise<void>
  ) => {
    const newItems: QueueItem[] = files.map(file => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${file.name}`,
      file,
      status: "pending" as const,
    }));

    setQueue(prev => [...prev, ...newItems]);

    // Start processing after state update
    setTimeout(() => processQueue(newItems, processor), 0);
  }, [processQueue]);

  const clearCompleted = useCallback(() => {
    setQueue(prev => prev.filter(q => q.status !== "completed" && q.status !== "error"));
  }, []);

  const clearAll = useCallback(() => {
    setQueue([]);
  }, []);

  return { queue, isProcessing, addFiles, clearCompleted, clearAll };
}
