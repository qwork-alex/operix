---
name: Phase 6D — Real Invoices + TVA + PDF
description: Safe, additive SaaS invoice engine on platform_invoices; PDF service, email queue, audit events, exports.
type: feature
---

Phase 6D adds **real invoice generation, PDF, TVA engine, email queue, audit, exports** as additive layers on top of `platform_invoices` (existing SaaS billing table). Nothing in the lifecycle, Stripe checkout, or operational `/billing` was changed.

## Schema (additive)
- `platform_invoices` + cols: `bank_snapshot jsonb`, `pdf_path`, `pdf_generated_at`, `vat_mode`.
- `invoice_events` — audit log (generated, sent, downloaded, pdf_regenerated, status_changed). Workspace members read; service role writes.
- `invoice_email_queue` — pending/sent/failed/dlq with attempts + scheduled_at.
- `invoice-pdfs` storage bucket (private), RLS scoped to `{workspace_id}/...`.

## Engine
- DB RPCs reused: `generate_platform_invoice`, `next_platform_invoice_number` (idempotent, locked sequence).
- `src/lib/invoices/tvaEngine.ts` — `with_vat | no_vat | reverse_charge` with FR 20% default and legal mention for reverse charge (Art. 196 EU VAT Directive 2006/112/EC).
- `src/lib/invoices/bankSnapshot.ts` — no_vat → Wise pessoal, with_vat/reverse_charge → conta empresa. Snapshot saved on the invoice.
- `src/lib/invoices/invoiceEngine.ts` — client wrapper.

## PDF
- Edge `generate-invoice-pdf` (auth-gated, membership-checked) builds A4 PDF via jsPDF, uploads to bucket, updates `pdf_path` and writes `invoice_events`. Returns signed URL (1h).

## Email
- Edge `process-invoice-emails` drains queue, signs PDF URL for 7 days, delegates send to existing `send-invoice-email`. Exponential backoff, DLQ after 5 attempts.

## UI
- `useWorkspaceInvoices` now reads from `platform_invoices` (mapping to legacy shape — drop-in).
- `WorkspaceInvoiceCenter`: download/open PDF (generate on demand), regenerate PDF, export CSV/JSON. Shows VAT-mode badge.

## Not changed
- Subscription lifecycle, `workspace_subscriptions`, Stripe webhooks, `/billing` operational, providers, routes, auth.
