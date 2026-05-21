# Fase 6C — Customer Portal + Billing Experience

Objetivo: Transformar `/subscription` num **Portal Financeiro premium** completo, sem quebrar a arquitetura SaaS interna nem o módulo `/billing` (este é operacional de clientes). Usa Stripe apenas como gateway, mantém planos e lifecycle internos como fonte de verdade.

---

## 1. Estrutura — novo Portal Financeiro

Reorganizar `SubscriptionPage` em **5 abas internas premium** (Tabs dentro do mesmo route `/subscription`):

```text
[ Visão geral ] [ Faturas ] [ Pagamento ] [ Faturação ] [ Histórico ]
```

- **Visão geral** — KPIs vivos (preço, técnicos, próximo escalão), banner de status, simulador, alertas inteligentes, próxima renovação.
- **Faturas** — Invoice Center.
- **Pagamento** — métodos de pagamento + portal Stripe.
- **Faturação** — perfil fiscal + modo TVA.
- **Histórico** — timeline detalhada.

Layout cinematográfico: glow refinado, gradientes dark luxury, micro-animações, status vivos.

---

## 2. Invoice Center (aba **Faturas**)

Mostra faturas da workspace (`billing_invoices` com `workspace_id = ws` e marcador interno) filtradas por estado:

- **Pagas** (verde glow)
- **Pendentes** (âmbar pulsante)
- **Falhadas** (vermelho)
- **Vencidas** (laranja)

Cada linha: número, data, valor, estado, ações (ver, descarregar PDF se `stripe_invoice_id` → link Stripe hosted invoice).

Hook novo: `useWorkspaceInvoices()` — query a `billing_invoices`.

---

## 3. Self-Service (aba **Pagamento**)

- **Métodos de pagamento** já existentes (`payment_methods` table) — lista com brand/last4.
- **Trocar cartão** → abre Stripe Customer Portal (botão já existe `StripePortalButton`, agora promovido a card primário).
- **Botão Cancelar Subscrição** → confirm dialog → chama portal Stripe (cancelamento é gerido lá).
- **Upgrade / Downgrade** → CTA leva a `/checkout?plan=…` (fluxo já existe).

---

## 4. TVA Mode (aba **Faturação**)

Atualizar `billing_profiles` para suportar 3 modos:

```sql
ALTER TABLE billing_profiles
  ADD COLUMN vat_mode text NOT NULL DEFAULT 'with_vat'
  CHECK (vat_mode IN ('with_vat','no_vat','reverse_charge'));
```

UI: card editável com:
- Nome legal, NIF/VAT, morada, país, cidade, código postal.
- Selector "Modo TVA": Com TVA / Sem TVA / Reverse charge (UE).
- Email de faturação.

Hook existente `useBillingProfile` + `useSaveBillingProfile` — só estende campos.

---

## 5. Subscription Timeline (aba **Histórico**)

Componente `SubscriptionTimeline` já existe — expandir:

- Eventos de `subscription_events` ordenados por data desc.
- Ícones por tipo: `trial_started`, `payment_succeeded`, `payment_failed`, `upgrade`, `downgrade`, `renewal`, `card_expiring`, `cancelled`.
- Glow por severidade (info/warning/error).
- Agrupado por mês.

---

## 6. Alertas inteligentes (banner topo da Visão geral)

Componente novo `BillingAlerts.tsx` — calcula client-side a partir do snapshot:

- **Trial a terminar** (≤ 5 dias) — âmbar.
- **Cobrança falhou** (status `overdue` / `grace_period`) — vermelho.
- **Cartão a expirar** (metadata Stripe, se disponível) — âmbar.
- **Upgrade sugerido** (técnicos ≥ 80% do escalão) — azul.

Cada alerta tem CTA dedicado (Renovar, Atualizar cartão, Upgrade).

---

## 7. Experiência Premium

- Glow refinado nos KPI cards (já usa semantic tokens — sem hardcode).
- Loading states com skeletons cinematográficos (não spinners).
- Toasts elegantes (sonner já configurado).
- Transições suaves entre tabs (framer-motion light).
- Indicadores vivos: pulse em estados warning/error, gradientes dark.

---

## 8. O que NÃO é alterado

- `/billing` (módulo operacional clientes) — intocado.
- Schema `workspace_subscriptions`, `subscription_plans`, lifecycle, RPCs (`get_workspace_subscription`, `start_workspace_checkout`, `activate_workspace_subscription`) — intocados.
- Edge functions Stripe (`create-checkout`, `payments-webhook`, `create-portal-session`) — intocadas (já feitas na 6B).
- Branding, layout global, sidebar, providers React — intocados.

---

## Arquivos a criar / editar

**Migration:**
- `…_vat_mode.sql` — adiciona `vat_mode` a `billing_profiles`.

**Componentes novos (`src/components/billing/`):**
- `BillingAlerts.tsx`
- `WorkspaceInvoiceCenter.tsx`
- `WorkspacePaymentMethods.tsx`
- `BillingProfileCard.tsx`
- `SubscriptionOverviewTab.tsx`

**Hooks novos (`src/hooks/`):**
- `useWorkspaceInvoices.ts`

**Editado:**
- `src/pages/SubscriptionPage.tsx` — reestruturação em Tabs (mantém conteúdo atual na aba Visão geral).
- `src/hooks/useBilling.ts` — estender `BillingProfile` com `vat_mode`.
- `src/components/billing/SubscriptionTimeline.tsx` — visual upgrade.
