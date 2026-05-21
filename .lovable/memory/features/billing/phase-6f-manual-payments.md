---
name: Phase 6F — Wise + bank fallback + manual payments
description: Manual bank transfer payment flow with proofs, dynamic bank routing by VAT mode, admin approval gating invoice paid status.
type: feature
---

Adds a SaaS fallback when Stripe is unavailable or VAT-driven routing requires a different account. Fully additive — Stripe lifecycle untouched.

## Schema
- `manual_bank_transfers` (existing) extended: `proof_path`, `payment_method` (bank_transfer | sepa | wise), `transfer_date`, `notes`, `submitted_by`, `reviewed_by`, `created_at`, `updated_at`. Status constraint widened to: `awaiting_transfer | pending_manual_review | confirmed | rejected` (default `awaiting_transfer`).
- New SELECT policy: workspace members can read their own transfers.
- Storage bucket `payment-proofs` (private), workspace-scoped (path `{workspace_id}/{invoice_id|misc}/...`). Members read, admins insert.

## RPCs (SECURITY DEFINER, owner/admin gated)
- `submit_manual_transfer(...)` — workspace admin (or owner) submits a transfer (with or without proof). Generates `MBT-yyyymmdd-xxxxxxxx` ref. Logs `invoice_events.manual_payment_submitted`.
- `approve_manual_transfer(_id, _notes)` — owner only. Inserts `platform_subscription_payments` (status=succeeded), marks invoice `paid` + `paid_at`, logs `manual_payment_approved`.
- `reject_manual_transfer(_id, _reason)` — owner only. Logs `manual_payment_rejected`.

## Bank routing (dynamic)
`useBankAccounts(vat_mode)` filters `platform_bank_accounts`:
- `no_vat` → Wise personal (account_type=`personal`)
- `with_vat` / `reverse_charge` → company account (`business`)
Fallback to all active accounts when nothing matches.

## UI
- `ManualPaymentDialog` — invoice-scoped, premium dark card with IBAN/BIC/reference copy chips, method picker (transfer/SEPA/Wise), date, amount, proof upload, notes.
- `WorkspaceInvoiceCenter` — adds "Pagar" button on unpaid invoices, transfer status badge inline.
- `ManualPaymentsReview` — owner Platform → Payments tab. Lists pending transfers with proof preview, approve/reject dialog (reason required for reject).

## Status lexicon (UI)
- `awaiting_transfer` → "Aguardando transferência" (sky)
- `pending_manual_review` → "Em análise" (amber)
- `confirmed` → "Aprovado" (emerald)
- `rejected` → "Rejeitado" (red)
