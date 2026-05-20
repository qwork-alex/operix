import { ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Trash2, RefreshCw, Archive } from "lucide-react";

type Variant = "danger" | "warning" | "info";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const variantConfig: Record<Variant, { icon: typeof AlertTriangle; tone: string }> = {
  danger:  { icon: Trash2,       tone: "text-destructive" },
  warning: { icon: AlertTriangle, tone: "text-warning" },
  info:    { icon: RefreshCw,    tone: "text-primary" },
};

/**
 * Reusable confirmation dialog for critical actions (delete, reset, archive,
 * financial modifications). Centralizes phrasing, spacing and ESC behavior.
 */
export function ConfirmDialog({
  open, title, description, confirmLabel = "Confirmar", cancelLabel = "Cancelar",
  variant = "warning", loading = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const { icon: Icon, tone } = variantConfig[variant];
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && !loading && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${tone}`} />
            {title}
          </AlertDialogTitle>
          {description && (
            <AlertDialogDescription className="text-xs leading-relaxed">
              {description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className={variant === "danger" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {loading ? "A processar…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { Archive };
