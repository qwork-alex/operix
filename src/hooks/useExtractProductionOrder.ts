import { useState } from "react";
import { withPromiseTimeout } from "@/lib/asyncGuard";
import { fileToBase64, pdfFirstPageToImageBase64 } from "@/lib/pdfUtils";

export type FieldConfidence = "high" | "medium" | "low";

export type ProductionOrderExtraction = {
  order: {
    client: string | null;
    platform: string | null;
    license_plate: string | null;
    vin: string | null;
    brand: string | null;
    model: string | null;
    color: string | null;
    insurer: string | null;
    vehicle_notes: string | null;
    field_confidence?: Partial<Record<string, FieldConfidence>>;
  };
  confidence: FieldConfidence;
  notes?: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "/api";

export function useExtractProductionOrder() {
  const [isExtracting, setIsExtracting] = useState(false);

  const extract = async (file: File): Promise<ProductionOrderExtraction> => {
    setIsExtracting(true);
    try {
      if (!file || file.size === 0) throw new Error("Ficheiro inválido.");
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const input = isPdf
        ? await pdfFirstPageToImageBase64(file, { maxWidth: 1600, quality: 0.9 })
        : { base64: await fileToBase64(file), mimeType: (file.type || "application/octet-stream") as string };

      const res = await withPromiseTimeout<Response>(
        fetch(`${API_URL}/extract/production-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: input.base64, mimeType: input.mimeType, fileName: file.name }),
        }),
        30000,
        "extract_production_order",
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? `Erro ${res.status}`);
      }

      return res.json() as Promise<ProductionOrderExtraction>;
    } finally {
      setIsExtracting(false);
    }
  };

  return { extract, isExtracting };
}
