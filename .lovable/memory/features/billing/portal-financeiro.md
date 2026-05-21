---
name: Portal Financeiro (Subscription Page)
description: Reestruturação da SubscriptionPage em 5 abas (Visão geral, Faturas, Pagamento, Faturação, Histórico) com alertas inteligentes, Invoice Center, métodos de pagamento, perfil fiscal com modo IVA e timeline cinematográfica.
type: feature
---

# Portal Financeiro

`/subscription` é o portal financeiro da workspace. Estrutura em 5 abas:

1. **Visão geral** — `BillingAlerts` + status banner + 3 KPIs (preço, técnicos, próximo escalão) + renovação + simulador + `BillingIntelligencePanel`.
2. **Faturas** — `WorkspaceInvoiceCenter` lê `billing_invoices` da workspace, agrupado em buckets: paid, pending, overdue, failed (calculados client-side em `bucketOf`).
3. **Pagamento** — `WorkspacePaymentMethods` lista `payment_methods` + `StripePortalButton` + CTA upgrade/downgrade/cancelar (cancelamento via Stripe Portal).
4. **Faturação** — `BillingProfileCard` edita `billing_profiles` incluindo `vat_mode` (with_vat | no_vat | reverse_charge).
5. **Histórico** — `SubscriptionTimeline` com agrupamento mensal, ícones por `event_type`, glow por severidade.

## Alertas inteligentes (`BillingAlerts`)
Calculados a partir do snapshot `useSubscription`:
- Trial a terminar (≤5 dias)
- Pagamento em atraso / suspensão
- Cartão a expirar (via `metadata.card_expiry` se disponível)
- Upgrade sugerido (técnicos ≥80% do escalão)

## Schema
- `billing_profiles.vat_mode text NOT NULL DEFAULT 'with_vat'` CHECK in ('with_vat','no_vat','reverse_charge').

## Constraints
- `/billing` (operacional clientes) é distinto e intocado.
- Stripe é só gateway: planos, preços, lifecycle continuam internos.
- Cancelamento delegado ao Stripe Customer Portal.
