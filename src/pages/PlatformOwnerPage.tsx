import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import {
  Shield, Building2, AlertCircle, Clock, CheckCircle2,
  Landmark, CreditCard, Receipt, Percent, Webhook, Activity,
  ScrollText, Power, Brain, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingState } from "@/components/shared/LoadingState";
import { PlatformFinancialDashboard } from "@/components/billing/PlatformFinancialDashboard";
import { SmartMetricsCards } from "@/components/billing/SmartMetricsCards";
import { AutomationPanel } from "@/components/billing/AutomationPanel";
import { SecurityDashboard } from "@/components/platform/SecurityDashboard";
import { useIsPlatformOwner } from "@/hooks/useSubscription";
import { toast } from "sonner";

export default function PlatformOwnerPage() {
  const { data: isOwner, isLoading: ownerLoading } = useIsPlatformOwner();

  if (ownerLoading) return <div className="module-shell"><LoadingState variant="cards" /></div>;
  if (!isOwner) return <Navigate to="/" replace />;

  return (
    <div className="module-shell space-y-6">
      <PageHeader icon={Shield} title="Plataforma" subtitle="Centro de billing interno — owner only" />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto bg-muted/30 p-1">
          <TabsTrigger value="overview"><Activity className="h-3.5 w-3.5 mr-1.5" />Visão geral</TabsTrigger>
          <TabsTrigger value="banks"><Landmark className="h-3.5 w-3.5 mr-1.5" />Contas bancárias</TabsTrigger>
          <TabsTrigger value="subscriptions"><Building2 className="h-3.5 w-3.5 mr-1.5" />Subscrições</TabsTrigger>
          <TabsTrigger value="payments"><CreditCard className="h-3.5 w-3.5 mr-1.5" />Pagamentos</TabsTrigger>
          <TabsTrigger value="vat"><Percent className="h-3.5 w-3.5 mr-1.5" />IVA</TabsTrigger>
          <TabsTrigger value="invoices"><Receipt className="h-3.5 w-3.5 mr-1.5" />Faturas</TabsTrigger>
          <TabsTrigger value="webhooks"><Webhook className="h-3.5 w-3.5 mr-1.5" />Webhooks</TabsTrigger>
          <TabsTrigger value="lifecycle"><Power className="h-3.5 w-3.5 mr-1.5" />Ciclo de vida</TabsTrigger>
          <TabsTrigger value="automation"><Brain className="h-3.5 w-3.5 mr-1.5" />Automação</TabsTrigger>
          <TabsTrigger value="audit"><ScrollText className="h-3.5 w-3.5 mr-1.5" />Auditoria</TabsTrigger>
          <TabsTrigger value="security"><Shield className="h-3.5 w-3.5 mr-1.5" />Segurança</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <SmartMetricsCards />
          <OverviewTab />
        </TabsContent>
        <TabsContent value="banks" className="mt-6"><BankAccountsTab /></TabsContent>
        <TabsContent value="subscriptions" className="mt-6"><SubscriptionsTab /></TabsContent>
        <TabsContent value="payments" className="mt-6"><PaymentsTab /></TabsContent>
        <TabsContent value="vat" className="mt-6"><VatTab /></TabsContent>
        <TabsContent value="invoices" className="mt-6"><InvoicesTab /></TabsContent>
        <TabsContent value="webhooks" className="mt-6"><WebhooksTab /></TabsContent>
        <TabsContent value="lifecycle" className="mt-6"><LifecycleTab /></TabsContent>
        <TabsContent value="automation" className="mt-6 space-y-6">
          <AutomationPanel />
          <SmartMetricsCards />
        </TabsContent>
        <TabsContent value="audit" className="mt-6"><AuditTab /></TabsContent>
        <TabsContent value="security" className="mt-6"><SecurityDashboard /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview — KPIs + tenants table (preserved from previous version)
// ---------------------------------------------------------------------------
function OverviewTab() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["platform-subscriptions-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_subscriptions")
        .select("id, workspace_id, status, billing_cycle, trial_ends_at, current_period_end, technician_count, current_price, created_at, workspaces(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const counts = rows.reduce((acc, r: any) => {
    acc.total++;
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, { total: 0 } as Record<string, number>);

  return (
    <div className="space-y-6">
      <PlatformFinancialDashboard />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Workspaces", value: counts.total, icon: Building2, tone: "text-foreground" },
          { label: "Activas", value: counts.active ?? 0, icon: CheckCircle2, tone: "text-emerald-500" },
          { label: "Em avaliação", value: counts.trial ?? 0, icon: Clock, tone: "text-amber-500" },
          { label: "Em atraso", value: counts.overdue ?? 0, icon: AlertCircle, tone: "text-orange-500" },
          { label: "Suspensas", value: counts.suspended ?? 0, icon: AlertCircle, tone: "text-red-500" },
        ].map((k) => (
          <Card key={k.label} className="p-4 surface-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <k.icon className={`h-3.5 w-3.5 ${k.tone}`} /> {k.label}
            </div>
            <p className="text-2xl font-semibold">{k.value}</p>
          </Card>
        ))}
      </div>

      <Card className="surface-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-semibold">Tenants</h3>
        </div>
        {isLoading ? <div className="p-6"><LoadingState variant="table" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2">Workspace</th>
                  <th className="text-left px-4 py-2">Estado</th>
                  <th className="text-left px-4 py-2">Ciclo</th>
                  <th className="text-right px-4 py-2">Técnicos</th>
                  <th className="text-right px-4 py-2">Preço</th>
                  <th className="text-left px-4 py-2">Renovação / Trial</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{r.workspaces?.name ?? "—"}</td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{r.status}</Badge></td>
                    <td className="px-4 py-2 text-xs">{r.billing_cycle}</td>
                    <td className="px-4 py-2 text-right">{r.technician_count}</td>
                    <td className="px-4 py-2 text-right">{Number(r.current_price).toFixed(2)} €</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {r.current_period_end
                        ? new Date(r.current_period_end).toLocaleDateString("pt-PT")
                        : r.trial_ends_at ? `Trial → ${new Date(r.trial_ends_at).toLocaleDateString("pt-PT")}` : "—"}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-xs">Sem workspaces.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bank accounts
// ---------------------------------------------------------------------------
function BankAccountsTab() {
  const qc = useQueryClient();
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["platform-bank-accounts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("platform_bank_accounts")
        .select("*").order("is_primary", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await (supabase as any).from("platform_bank_accounts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Conta atualizada"); qc.invalidateQueries({ queryKey: ["platform-bank-accounts"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <LoadingState variant="cards" />;

  return (
    <div className="space-y-4">
      {accounts.map((a: any) => (
        <Card key={a.id} className="surface-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">{a.account_name}</h3>
                {a.is_primary && <Badge className="text-[10px]">Primary</Badge>}
                <Badge variant="outline" className="text-[10px]">{a.currency}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{a.bank_name} · {a.country} · {a.account_type}</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Ativa</span>
              <Switch checked={a.active} onCheckedChange={(v) => update.mutate({ id: a.id, patch: { active: v } })} />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground">IBAN</label>
              <Input defaultValue={a.iban ?? ""} placeholder="FR76 ..."
                onBlur={(e) => e.target.value !== (a.iban ?? "") && update.mutate({ id: a.id, patch: { iban: e.target.value || null } })} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">BIC / SWIFT</label>
              <Input defaultValue={a.bic ?? ""} placeholder="CMCIFRPP"
                onBlur={(e) => e.target.value !== (a.bic ?? "") && update.mutate({ id: a.id, patch: { bic: e.target.value || null } })} />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {(a.supported_methods ?? []).map((m: string) => (
              <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscriptions (workspace_subscriptions, read-only here)
// ---------------------------------------------------------------------------
function SubscriptionsTab() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["platform-subs-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_subscriptions")
        .select("*, workspaces(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) return <LoadingState variant="table" />;
  return (
    <Card className="surface-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2">Workspace</th>
              <th className="text-left px-4 py-2">Estado</th>
              <th className="text-left px-4 py-2">Ciclo</th>
              <th className="text-right px-4 py-2">Técnicos</th>
              <th className="text-right px-4 py-2">Preço/mês</th>
              <th className="text-left px-4 py-2">Trial termina</th>
              <th className="text-left px-4 py-2">Período atual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="px-4 py-2 font-medium">{r.workspaces?.name ?? r.workspace_id}</td>
                <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{r.status}</Badge></td>
                <td className="px-4 py-2 text-xs">{r.billing_cycle}</td>
                <td className="px-4 py-2 text-right">{r.technician_count}</td>
                <td className="px-4 py-2 text-right">{Number(r.current_price).toFixed(2)} €</td>
                <td className="px-4 py-2 text-xs">{r.trial_ends_at ? new Date(r.trial_ends_at).toLocaleDateString("pt-PT") : "—"}</td>
                <td className="px-4 py-2 text-xs">{r.current_period_end ? new Date(r.current_period_end).toLocaleDateString("pt-PT") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Payments (manual entry placeholder until Stripe phase)
// ---------------------------------------------------------------------------
function PaymentsTab() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["platform-payments"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("platform_subscription_payments")
        .select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) return <LoadingState variant="table" />;
  return (
    <Card className="surface-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Pagamentos registados</h3>
        <span className="text-[11px] text-muted-foreground">Stripe será integrado na próxima fase</span>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-xs text-muted-foreground">Sem pagamentos ainda.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2">Data</th>
                <th className="text-left px-4 py-2">Workspace</th>
                <th className="text-left px-4 py-2">Método</th>
                <th className="text-right px-4 py-2">Valor</th>
                <th className="text-left px-4 py-2">Estado</th>
                <th className="text-left px-4 py-2">Ref. externa</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p: any) => (
                <tr key={p.id} className="border-t border-border/40">
                  <td className="px-4 py-2 text-xs">{new Date(p.created_at).toLocaleString("pt-PT")}</td>
                  <td className="px-4 py-2 text-xs font-mono">{p.workspace_id.slice(0, 8)}…</td>
                  <td className="px-4 py-2 text-xs">{p.method}</td>
                  <td className="px-4 py-2 text-right">{Number(p.amount).toFixed(2)} {p.currency}</td>
                  <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{p.status}</Badge></td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{p.external_ref ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// VAT tab — rules + live calculator
// ---------------------------------------------------------------------------
function VatTab() {
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["platform-vat-rules"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("platform_vat_rules")
        .select("*").order("country");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [country, setCountry] = useState("FR");
  const [isBusiness, setIsBusiness] = useState(false);
  const [vatNumber, setVatNumber] = useState("");
  const [result, setResult] = useState<any>(null);

  const calc = async () => {
    const { data, error } = await (supabase as any).rpc("calculate_vat", {
      _country: country, _is_business: isBusiness, _vat_number: vatNumber || null,
    });
    if (error) return toast.error(error.message);
    setResult(data);
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className="surface-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Percent className="h-4 w-4" />Calculadora de IVA</h3>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground">País (ISO-2)</label>
            <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs">Empresa (B2B)</span>
            <Switch checked={isBusiness} onCheckedChange={setIsBusiness} />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Nº IVA (opcional)</label>
            <Input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="FR12345678901" />
          </div>
          <Button onClick={calc} className="w-full">Calcular</Button>
          {result && (
            <div className="rounded border border-border/40 p-3 text-xs space-y-1 bg-muted/20">
              <div>Taxa: <span className="font-semibold">{result.rate}%</span></div>
              <div>Reverse charge: <span className="font-semibold">{result.reverse_charge ? "Sim" : "Não"}</span></div>
              <div>Isenção: <span className="font-semibold">{result.exemption_reason ?? "—"}</span></div>
            </div>
          )}
        </div>
      </Card>

      <Card className="surface-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-semibold">Regras por país</h3>
        </div>
        {isLoading ? <div className="p-6"><LoadingState variant="table" /></div> : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2">País</th>
                <th className="text-right px-4 py-2">Taxa</th>
                <th className="text-center px-4 py-2">UE</th>
                <th className="text-center px-4 py-2">Reverse B2B</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r: any) => (
                <tr key={r.id} className="border-t border-border/40">
                  <td className="px-4 py-2 font-mono text-xs">{r.country}</td>
                  <td className="px-4 py-2 text-right">{Number(r.standard_rate).toFixed(2)}%</td>
                  <td className="px-4 py-2 text-center">{r.eu_member ? "✓" : "—"}</td>
                  <td className="px-4 py-2 text-center">{r.reverse_charge_when_business ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
function InvoicesTab() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["platform-invoices"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("platform_invoices")
        .select("*").order("issue_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) return <LoadingState variant="table" />;
  return (
    <Card className="surface-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40">
        <h3 className="text-sm font-semibold">Faturas internas (workspaces)</h3>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-xs text-muted-foreground">Sem faturas emitidas.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2">Número</th>
                <th className="text-left px-4 py-2">Emissão</th>
                <th className="text-left px-4 py-2">Venc.</th>
                <th className="text-left px-4 py-2">Cliente</th>
                <th className="text-right px-4 py-2">Subtotal</th>
                <th className="text-right px-4 py-2">IVA</th>
                <th className="text-right px-4 py-2">Total</th>
                <th className="text-left px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i: any) => (
                <tr key={i.id} className="border-t border-border/40">
                  <td className="px-4 py-2 font-mono text-xs">{i.invoice_number}</td>
                  <td className="px-4 py-2 text-xs">{i.issue_date}</td>
                  <td className="px-4 py-2 text-xs">{i.due_date}</td>
                  <td className="px-4 py-2 text-xs">{i.customer_name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{Number(i.subtotal).toFixed(2)} {i.currency}</td>
                  <td className="px-4 py-2 text-right">{Number(i.vat_amount).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-semibold">{Number(i.total).toFixed(2)}</td>
                  <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{i.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
function WebhooksTab() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["platform-webhooks"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("platform_webhook_events")
        .select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });
  if (isLoading) return <LoadingState variant="table" />;
  return (
    <Card className="surface-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Fila de eventos internos</h3>
        <span className="text-[11px] text-muted-foreground">Auto-refresh 15s</span>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-xs text-muted-foreground">Sem eventos.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2">Quando</th>
                <th className="text-left px-4 py-2">Tipo</th>
                <th className="text-left px-4 py-2">Estado</th>
                <th className="text-right px-4 py-2">Tentativas</th>
                <th className="text-left px-4 py-2">Erro</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e: any) => (
                <tr key={e.id} className="border-t border-border/40">
                  <td className="px-4 py-2 text-xs">{new Date(e.created_at).toLocaleString("pt-PT")}</td>
                  <td className="px-4 py-2 text-xs font-mono">{e.event_type}</td>
                  <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{e.status}</Badge></td>
                  <td className="px-4 py-2 text-right text-xs">{e.attempts}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-[200px]">{e.last_error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Lifecycle — owner manually transitions subscription status
// ---------------------------------------------------------------------------
function LifecycleTab() {
  const qc = useQueryClient();
  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["platform-lifecycle-subs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_subscriptions")
        .select("id, workspace_id, status, suspension_mode, legal_hold, current_price, technician_count, workspaces(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"soft" | "hard">("soft");

  const transition = useMutation({
    mutationFn: async ({ ws, status }: { ws: string; status: string }) => {
      const { error } = await (supabase as any).rpc("transition_subscription_status", {
        _workspace_id: ws,
        _new_status: status,
        _reason: reason || null,
        _suspension_mode: status === "suspended" ? mode : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estado atualizado");
      setReason("");
      qc.invalidateQueries({ queryKey: ["platform-lifecycle-subs"] });
      qc.invalidateQueries({ queryKey: ["platform-subscriptions-overview"] });
      qc.invalidateQueries({ queryKey: ["platform-audit-logs"] });
    },
    onError: (e: any) => toast.error(e.message || "Transição inválida"),
  });

  const selected = subs.find((s: any) => s.workspace_id === picked) as any;

  if (isLoading) return <LoadingState variant="cards" />;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className="surface-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-semibold">Workspaces</h3>
        </div>
        <div className="max-h-[480px] overflow-y-auto divide-y divide-border/40">
          {subs.map((s: any) => (
            <button
              key={s.id}
              onClick={() => setPicked(s.workspace_id)}
              className={`w-full text-left px-4 py-3 hover:bg-muted/30 ${picked === s.workspace_id ? "bg-muted/40" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{s.workspaces?.name ?? s.workspace_id.slice(0, 8)}</span>
                <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {s.technician_count} técnicos · {Number(s.current_price).toFixed(2)} €
                {s.legal_hold ? " · ⚠ legal hold" : ""}
                {s.suspension_mode ? ` · ${s.suspension_mode}` : ""}
              </p>
            </button>
          ))}
          {subs.length === 0 && (
            <div className="p-6 text-xs text-center text-muted-foreground">Sem subscrições.</div>
          )}
        </div>
      </Card>

      <Card className="surface-card p-5 space-y-4">
        {!selected ? (
          <p className="text-xs text-muted-foreground text-center py-12">Selecione uma workspace para gerir o estado.</p>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold">{selected.workspaces?.name ?? selected.workspace_id}</h3>
              <p className="text-xs text-muted-foreground">Estado actual: <Badge variant="outline" className="text-[10px]">{selected.status}</Badge></p>
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground">Motivo (auditoria)</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex: pagamento não recebido" />
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground">Modo de suspensão</label>
              <div className="flex gap-2 mt-1">
                <Button size="sm" variant={mode === "soft" ? "default" : "outline"} onClick={() => setMode("soft")}>Soft</Button>
                <Button size="sm" variant={mode === "hard" ? "default" : "outline"} onClick={() => setMode("hard")}>Hard</Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Soft = leitura + export · Hard = só faturação
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              {[
                { label: "Activar", value: "active" },
                { label: "Tolerância", value: "grace_period" },
                { label: "Em atraso", value: "past_due" },
                { label: "Overdue", value: "overdue" },
                { label: "Suspender", value: "suspended" },
                { label: "Cancelar", value: "cancelled" },
                { label: "Legal hold", value: "legal_hold" },
              ].map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant="outline"
                  disabled={transition.isPending || opt.value === selected.status}
                  onClick={() => transition.mutate({ ws: selected.workspace_id, status: opt.value })}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit — append-only billing audit log
// ---------------------------------------------------------------------------
function AuditTab() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["platform-audit-logs"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("billing_audit_logs")
        .select("*, workspaces(name)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) return <LoadingState variant="table" />;

  return (
    <Card className="surface-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Auditoria de billing</h3>
        <span className="text-[11px] text-muted-foreground">Append-only · 300 últimos</span>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-xs text-muted-foreground">Sem eventos auditados.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2">Quando</th>
                <th className="text-left px-4 py-2">Workspace</th>
                <th className="text-left px-4 py-2">Categoria</th>
                <th className="text-left px-4 py-2">Acção</th>
                <th className="text-left px-4 py-2">Severidade</th>
                <th className="text-left px-4 py-2">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e: any) => (
                <tr key={e.id} className="border-t border-border/40">
                  <td className="px-4 py-2 text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString("pt-PT")}</td>
                  <td className="px-4 py-2 text-xs">{e.workspaces?.name ?? (e.workspace_id ? e.workspace_id.slice(0, 8) : "—")}</td>
                  <td className="px-4 py-2 text-xs font-mono">{e.category}</td>
                  <td className="px-4 py-2 text-xs">{e.action}</td>
                  <td className="px-4 py-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        e.severity === "critical" ? "border-red-500/40 text-red-500" :
                        e.severity === "warning"  ? "border-amber-500/40 text-amber-500" : ""
                      }`}
                    >{e.severity}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{e.message ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
