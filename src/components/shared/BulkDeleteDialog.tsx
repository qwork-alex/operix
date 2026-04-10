import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2 } from "lucide-react";

interface BulkDeleteDialogProps {
  open: boolean;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

export function BulkDeleteDialog({ open, count, onConfirm, onCancel, isPending }: BulkDeleteDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const isValid = confirmText.toUpperCase() === "CONFIRMAR";

  const handleCancel = () => {
    setConfirmText("");
    onCancel();
  };

  const handleConfirm = () => {
    if (!isValid) return;
    setConfirmText("");
    onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && handleCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Confirmar exclusão em massa
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Você está prestes a excluir <strong className="text-foreground">{count} {count === 1 ? "item" : "itens"}</strong>.
              Esta ação <strong className="text-destructive">não pode ser desfeita</strong>.
            </p>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Para confirmar, digite <strong className="text-foreground">CONFIRMAR</strong> abaixo:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CONFIRMAR"
                className="font-mono"
                autoFocus
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isValid || isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
            Excluir {count} {count === 1 ? "item" : "itens"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
