import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultEmail?: string;
}

export function ForgotPasswordDialog({ open, onOpenChange, defaultEmail = "" }: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!email.trim()) {
      toast.error("Informe um e-mail.");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSent(false); }}>
      <DialogContent className="sm:max-w-md glass-panel border-border">
        <DialogHeader>
          <DialogTitle>Recuperar senha</DialogTitle>
          <DialogDescription>
            {sent
              ? "Verifique a sua caixa de entrada e siga o link de recuperação."
              : "Digite o e-mail da sua conta. Enviaremos um link seguro para redefinir a senha."}
          </DialogDescription>
        </DialogHeader>

        {!sent ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fp-email" className="flex items-center gap-2 text-foreground">
                <Mail className="h-3.5 w-3.5" /> E-mail
              </Label>
              <Input
                id="fp-email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com" required autoFocus
                className="bg-muted/50 border-border"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar link de recuperação
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} className="w-full">Fechar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface DuplicateProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  email: string;
  onSignIn: () => void;
  onRecover: () => void;
}

export function DuplicateEmailDialog({ open, onOpenChange, email, onSignIn, onRecover }: DuplicateProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md glass-panel border-border">
        <DialogHeader>
          <DialogTitle>Este e-mail já está cadastrado</DialogTitle>
          <DialogDescription>
            A conta <span className="text-foreground font-medium">{email}</span> já existe. O que deseja fazer?
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
          <Button variant="outline" onClick={onRecover}>Recuperar senha</Button>
          <Button onClick={onSignIn}>Entrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
