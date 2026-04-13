import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PendingBulkEdit {
  field: string;
  value: any;
  label: string;
  /** For service fields: the index (0-3) of the service slot being edited */
  serviceIndex?: number;
  /** For service fields: which sub-field ("name" | "price") */
  serviceField?: "name" | "price";
}

interface BulkEditBannerProps {
  pending: PendingBulkEdit | null;
  onApply: () => void;
  onDismiss: () => void;
}

export function BulkEditBanner({ pending, onApply, onDismiss }: BulkEditBannerProps) {
  if (!pending) return null;

  const displayValue = typeof pending.value === "string"
    ? `"${pending.value}"`
    : typeof pending.value === "number"
    ? String(pending.value)
    : "...";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
      <Copy className="h-4 w-4 text-primary shrink-0" />
      <p className="text-xs text-foreground flex-1">
        Aplicar <span className="font-semibold">{pending.label}</span> = {displayValue} para todas as linhas?
      </p>
      <div className="flex gap-1.5">
        <Button size="sm" variant="default" className="h-7 text-xs px-3" onClick={onApply}>
          Sim
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs px-3" onClick={onDismiss}>
          Não
        </Button>
      </div>
    </div>
  );
}
