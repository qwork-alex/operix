# Fase 6E — Webhooks + Retries + Cobrança Automática (Safe Mode)

Aditivo. Reaproveita o que já existe das fases 2.5 → 6D. Nenhum redesign, nenhuma alteração ao Stripe gateway, lifecycle, rotas, providers, sidebar ou branding.

---

## O que já existe (não recriar)

- `run_subscription_automation()` (renewals + retries + dunning + transições) — Fase 4.
- `process_lifecycle_transitions()` — Fase 4 (trial→active, failed→retry, retry→suspended, suspended→cancelled).
- `payments-webhook` — recebe `customer.subscription.*`, `invoice.paid/payment_failed`, `checkout.session.completed`.
- `subscription_events` + `log_subscription_event` — audit log.
- `billing_invoices` + `generate-invoice-pdf` + `process-invoice-emails` + `send-invoice-email` — Fase 6D.
- `BillingAlerts`, `AccessStateBanner` UI.

Fase 6E só **liga as pontas**, **agenda execução** e **adiciona emails de dunning**.

---

## Passos (cada um validado isoladamente)

### PASSO 1 — Webhook completeness

`payments-webhook/index.ts`: após cada handler, chamar `generate_invoice` (idempotente) em `invoice.payment_succeeded` para emitir fatura + enfileirar PDF + email. Em `invoice.payment_failed`, enfileirar alerta dunning. Eventos `renewed` e `canceled` já cobertos pelos handlers existentes — só garantir `log_subscription_event` em todos os ramos.

### PASSO 2 — Cron de automação (pg_cron)

Agendar `run_subscription_automation()` diariamente às 03:00 UTC via `pg_cron` + `pg_net` (chamada a uma edge function fina `run-billing-automation` que invoca a RPC e devolve resumo). Permite execução manual mantida no `AutomationPanel`.

### PASSO 3 — Dunning emails

Tabela existente `dunning_events` (já criada em 2.5) — adicionar trigger AFTER INSERT que enfileira em `invoice_email_queue` (reaproveitar) com `template_kind` ∈ `reminder|warning|risk|suspension`. Edge function `send-dunning-email` (novo, isolado) consome a fila para templates de dunning. UI de invoices não muda.

### PASSO 4 — Lifecycle emails

Templates em `send-invoice-email` estendidos com modos:
- `payment_succeeded`
- `payment_failed`
- `renewal_upcoming`
- `invoice_issued` (já existe)

Disparados a partir de triggers em `subscription_events` (AFTER INSERT) para tipos relevantes — enfileiram, não enviam síncrono.

### PASSO 5 — Event log unificado

Garantir que TODOS os ramos do webhook + cron + dunning chamam `log_subscription_event`. Adicionar índice `(workspace_id, created_at desc)` se faltar. Sem nova tabela.

### PASSO 6 — UI mínima (aditiva)

`AutomationPanel` já existe. Acrescentar:
- Último run timestamp (lido de `subscription_events` tipo `automation.run`).
- Pequeno indicador "Cron ativo" se job pg_cron existir.

Nada mais muda visualmente.

---

## Ficheiros

**Migrations:** 1 (cron + triggers de email + índices).
**Novos:** `supabase/functions/run-billing-automation/index.ts`, `supabase/functions/send-dunning-email/index.ts`.
**Editados (mínimos):** `payments-webhook/index.ts` (chamar `generate_invoice` + log adicional), `AutomationPanel.tsx` (mostrar último run + cron status).

---

## Fora de scope

- Mudar gateway Stripe.
- Alterar `subscription_plans`, `workspace_subscriptions` schema.
- Customer Portal (já implementado).
- Redesign UI.
- Substituir lifecycle engine.

---

## Validação entre passos

1. `cloud_status` após cada migration.
2. Preview `/subscription`, `/platform`, `/billing` carregam sem erro.
3. Cron job aparece em `cron.job`.
4. Rollback: drop cron job + triggers novos + apagar 2 edge functions novas.
