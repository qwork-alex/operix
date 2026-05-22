/**
 * Workspace plan matrix — shows all active workspace tiers side by side
 * with the current plan highlighted. Each tier exposes an
 * Upgrade / Downgrade / Current action that routes the admin to the
 * checkout flow with the right plan + billing cycle.
 *
 * Designed to feel like an enterprise SaaS billing console: hierarchical,
 * transparent, no marketing flourish.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, ArrowUpRight, ArrowDownRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchWorkspaceTiers,
  formatPriceWithVAT,
  type BillingCycle,
  type WorkspaceTier,
} from "@/lib/billing";

interface WorkspacePlanMatrixProps {
  currentPlanCode: string;
  currentCycle: BillingCycle;
  technicianCount: number;
}

function describeRange(t: WorkspaceTier): string {
  if (t.tier_min == null && t.tier_max == null) return "Sem limite";
  if (t.tier_min == null) return `Até ${t.tier_max} técnicos`;
  if (t.tier_max == null) return `A partir de ${t.tier_min} técnicos`;
  return `${t.tier_min}–${t.tier_max} técnicos`;
}

export function WorkspacePlanMatrix({
  currentPlanCode,
  currentCycle,
  technicianCount,
}: WorkspacePlanMatrixProps) {
  const [tiers, setTiers] = useState<WorkspaceTier[]>([]);
  const [cycle, setCycle] = useState<BillingCycle>(currentCycle);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchWorkspaceTiers().then((rows) => {
      if (cancelled) return;
      setTiers(rows.sort((a, b) => a.sort_order - b.sort_order));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const currentIndex = tiers.findIndex((t) => t.code === currentPlanCode);

  return (
    <Card className="p-5 surface-card space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Planos da workspace</h3>
          <p className="text-xs text-muted-foreground">
            Mude de escalão a qualquer momento — a faturação é ajustada na próxima renovação.
          </p>
        </div>
        <Tabs value={cycle} onValueChange={(v) => setCycle(v as BillingCycle)}>
          <TabsList className="h-8">
            <TabsTrigger value="monthly" className="text-xs">Mensal</TabsTrigger>
            <TabsTrigger value="yearly" className="text-xs">Anual (10×)</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-lg border border-border/40 bg-muted/20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tiers.map((tier, idx) => {
            const isCurrent = tier.code === currentPlanCode;
            const direction: "upgrade" | "downgrade" | "current" =
              isCurrent ? "current"
                : currentIndex < 0 ? "upgrade"
                : idx > currentIndex ? "upgrade" : "downgrade";
            const price = cycle === "yearly" ? tier.yearly_price : tier.base_price_monthly;
            const fitsCount =
              technicianCount >= (tier.tier_min ?? 1) &&
              technicianCount <= (tier.tier_max ?? Number.MAX_SAFE_INTEGER);

            return (
              <div
                key={tier.code}
                className={cn(
                  "relative rounded-lg border p-4 flex flex-col gap-3 transition-all",
                  isCurrent
                    ? "border-primary/40 bg-primary/5 shadow-[0_0_24px_rgba(99,102,241,0.18)]"
                    : "border-border/40 bg-card/40 hover:bg-card/60",
                )}
              >
                {isCurrent && (
                  <Badge variant="outline" className="absolute -top-2 right-3 text-[10px] uppercase tracking-wider border-primary/40 bg-background">
                    Plano atual
                  </Badge>
                )}

                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {tier.name}
                  </p>
                  <p className="text-lg font-semibold leading-tight">
                    {formatPriceWithVAT(price, cycle)}
                  </p>
                </div>

                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3 w-3" />
                  {describeRange(tier)}
                  {fitsCount && !isCurrent && (
                    <span className="ml-auto text-emerald-500/80">Compatível</span>
                  )}
                </div>

                <div className="mt-auto pt-2">
                  {direction === "current" ? (
                    <Button size="sm" variant="outline" disabled className="w-full gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Em uso
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant={direction === "upgrade" ? "default" : "outline"} className="w-full gap-1.5">
                      <Link to={`/checkout?plan=${tier.code}&cycle=${cycle}`}>
                        {direction === "upgrade" ? (
                          <><ArrowUpRight className="h-3.5 w-3.5" /> Fazer upgrade</>
                        ) : (
                          <><ArrowDownRight className="h-3.5 w-3.5" /> Fazer downgrade</>
                        )}
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-3">
        Anual aplica o equivalente a 10 mensalidades — paga 10 meses, recebe 12.
        Todos os preços excluem IVA.
      </p>
    </Card>
  );
}
