import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Banknote, ShieldCheck, AlertCircle } from "lucide-react";
import { usePaymentMethods } from "@/hooks/useBilling";
import { StripePortalButton } from "./StripePortalButton";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function WorkspacePaymentMethods() {
  const { data: methods = [], isLoading } = usePaymentMethods();
  const { data: snapshot } = useSubscription();
  const [confirmCancel, setConfirmCancel] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="p-5 surface-card">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Métodos de pagamento
            </h3>
            <p className="text-xs text-muted-foreground">Cartões e contas associadas a esta workspace</p>
          </div>
          <StripePortalButton label="Adicionar / trocar cartão" variant="default" />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : methods.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <CreditCard className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            Nenhum método de pagamento registado.
          </div>
        ) : (
          <div className="space-y-2">
            {methods.map((m) => {
              const isCard = m.kind === "card";
              const isSepa = m.kind === "sepa";
              const Icon = isCard ? CreditCard : Banknote;
              return (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-card/40">
                  <div className="h-9 w-9 rounded-md grid place-items-center bg-background/60 border border-border/40 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold uppercase">
                        {isCard ? `${m.brand ?? "Cartão"} •••• ${m.last4 ?? "----"}` : isSepa ? `SEPA ${m.iban_masked ?? ""}` : "Transferência manual"}
                      </span>
                      {m.is_default && <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">Padrão</Badge>}
                    </div>
                    {m.holder_name && <p className="text-xs text-muted-foreground">{m.holder_name}</p>}
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize">{m.provider}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-5 surface-card">
        <div className="flex items-start gap-3 mb-4">
          <ShieldCheck className="h-5 w-5 text-emerald-400 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">Gestão da subscrição</h3>
            <p className="text-xs text-muted-foreground">Faça upgrade, downgrade ou cancele através do portal seguro.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {snapshot?.plan && (
            <>
              <Button asChild size="sm" variant="default">
                <Link to={`/checkout?plan=${snapshot.plan.code}&cycle=yearly`}>Upgrade / Mudar de plano</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/checkout">Ver todos os planos</Link>
              </Button>
            </>
          )}
          <StripePortalButton label="Portal financeiro" />
          {snapshot?.subscription?.status !== "cancelled" && (
            <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300">
                  <AlertCircle className="h-3.5 w-3.5 mr-2" />
                  Cancelar subscrição
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar subscrição?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O cancelamento é processado no portal Stripe. Manterá acesso até ao fim do período atual.
                    Será redirecionado para confirmar a operação de forma segura.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <span><StripePortalButton label="Abrir portal" variant="default" /></span>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </Card>
    </div>
  );
}
