# Fase 6D — Real Invoices + TVA + PDF (Safe Mode)

Implementação **incremental, defensiva, aditiva**. Nenhuma rota, provider, hook ou lifecycle existente é alterado. Todas as peças novas vivem em ficheiros isolados e tabelas complementares. Após cada passo validamos o preview antes de avançar.

---

## Princípios

- **Aditivo apenas.** Nada de reescrever Subscription Engine, Stripe lifecycle, autenticação, rotas ou layout.
- **Reaproveitar `billing_invoices`** (já existe) — só adicionamos colunas + novas tabelas auxiliares.
- **Falha isolada.** Erros em PDF/email/export NUNCA derrubam UI nem checkout.
- **Idempotência** em geração, numeração e envio.
- **Rollback fácil:** cada passo é uma migration + ficheiros novos, removíveis sem efeitos colaterais.

---

## Arquitetura

```text
                  ┌──────────────────────┐
   evento ───►    │  invoice_engine (RPC)│ ──► billing_invoices (+ items, events)
 (renew/upgrade/  └──────────┬───────────┘
  payment/active)            │
                             ├──► tva_engine (calc com_iva / sem_iva / reverse_charge)
                             ├──► bank_snapshot (Wise pessoal vs empresa)
                             ├──► pdf_service  (edge function isolada)
                             └──► email_queue  (tabela + dispatcher cron)
```

---

## Passos (executados um de cada vez, com validação de preview entre eles)

### PASSO 1 — Schema base (migration)

- `billing_invoices`: adicionar colunas (nullable, defaults seguros)
  `vat_mode`, `vat_rate`, `subtotal_amount`, `vat_amount`, `bank_snapshot jsonb`, `pdf_path`, `pdf_generated_at`, `sequence_year`, `sequence_number`.
- `invoice_items` (novo): id, invoice_id, description, quantity, unit_amount, vat_rate, line_total.
- `invoice_events` (novo): id, invoice_id, type (`generated|sent|downloaded|status_changed|pdf_regenerated`), payload jsonb, actor_id, created_at.
- `invoice_email_queue` (novo): id, invoice_id, recipient, status (`pending|sent|failed|dlq`), attempts, last_error, scheduled_at.
- `invoice_sequences` (novo): year int PK, last_number bigint — para numeração segura.
- RPC `next_invoice_number(year)` (SECURITY DEFINER, locking) → devolve `INV-YYYY-000001`.
- RPC `generate_invoice(workspace_id, kind, source_ref, items[], vat_mode)` idempotente por `(workspace_id, source_ref, kind)`.
- RLS: workspace members leem; só service role escreve em items/events/queue/sequences.

### PASSO 2 — Invoice Engine (TS)

- `src/lib/invoices/invoiceEngine.ts` — wrapper client das RPC.
- `src/lib/invoices/tvaEngine.ts` — cálculo: `with_vat` (20% FR default por workspace country), `no_vat`, `reverse_charge` (mostra menção legal "Reverse charge – Article 196 EU VAT Directive 2006/112/EC", IVA 0).
- `src/lib/invoices/bankSnapshot.ts` — regra: `no_vat → wise_personal`, `with_vat|reverse_charge → company_account`. Lê de `company_settings` + fallback config.
- Hook `useGenerateInvoice()` (TanStack) que envolve a RPC.

### PASSO 3 — Triggers de geração

Edge function existente `payments-webhook` chama `generate_invoice` no evento `invoice.payment_succeeded` (idempotente). Adicionalmente um helper client invoca após upgrade/ativação manual. Nada do lifecycle Stripe muda.

### PASSO 4 — PDF service (edge function isolada)

- `supabase/functions/generate-invoice-pdf/index.ts` (verify_jwt = true).
- Gera PDF com `jspdf` (Deno-compatível) ou HTML→PDF via `npm:@react-pdf/renderer`. Decisão: jsPDF (zero-deps Deno).
- Layout: header com `company_settings` (logo, nome, branding tokens), bloco emissor, bloco cliente (`billing_profiles`), tabela items, subtotal, TVA, total, menção legal TVA, snapshot bancário, footer com invoice number + datas.
- Upload para storage bucket `invoice-pdfs` (criar privado, RLS por workspace).
- Grava `pdf_path` + `pdf_generated_at` + `invoice_events('pdf_regenerated' | 'generated')`.

### PASSO 5 — Email queue

- Cron `process-invoice-emails` (a cada 1 min, pg_cron + pg_net) que processa `invoice_email_queue` em lotes pequenos.
- Edge function `send-invoice-notification` consome a fila, usa Lovable Emails (template novo `invoice-issued`) e regista `invoice_events('sent')`.
- UI não bloqueia: enfileira e devolve toast otimista.

### PASSO 6 — UI Invoice Center (aditivo)

- `WorkspaceInvoiceCenter` (já existe) — só estendemos para mostrar botão **Descarregar PDF** que chama signed URL, e botão **Regenerar PDF** (admin).
- Componente novo `InvoiceDetailsDrawer.tsx` (drawer lateral) com items, TVA, snapshot bancário, timeline (`invoice_events`).
- Sem mudar tabs, layout ou rotas.

### PASSO 7 — Exportação

- Hook `useExportInvoices(format: 'pdf'|'csv'|'json')`.
- PDF: zip de PDFs existentes (ou regenera em falta).
- CSV/JSON: client-side, a partir de `billing_invoices` + `invoice_items` já carregados.
- Botão único no header do Invoice Center.

---

## Validação entre passos

Após cada passo:
1. `cloud_status` se passo tocou DB.
2. Verificar preview (`/subscription` carrega, sem erros consola).
3. Verificar que rotas `/billing`, `/checkout`, `/platform`, `/dashboard` continuam intactas.
4. Se quebrar → rollback do passo (drop tabelas adicionadas ou apagar ficheiros novos) e parar.

---

## Ficheiros previstos

**Migrations:** 1 por passo (1, 4-bucket, 5-cron).
**Novos:** `src/lib/invoices/*`, `src/hooks/useGenerateInvoice.ts`, `src/hooks/useExportInvoices.ts`, `src/components/billing/InvoiceDetailsDrawer.tsx`, `supabase/functions/generate-invoice-pdf/`, `supabase/functions/send-invoice-notification/`.
**Editados (mínimo):** `WorkspaceInvoiceCenter.tsx` (botões PDF/export), `payments-webhook/index.ts` (chamar `generate_invoice`).

---

## Fora de scope (explicitamente)

- Substituir checkout Stripe.
- Mexer em `workspace_subscriptions`, `subscription_plans`, lifecycle, RPCs existentes.
- Alterar `/billing` operacional.
- Customer Portal (já existe botão; não tocado).
- Branding, sidebar, providers React.
