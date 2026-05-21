---
name: Phase 6E — Webhooks + Retries + Cobrança Automática
description: Daily cron runs subscription automation; dunning events auto-enqueue emails by stage; event log indexed; AutomationPanel shows cron status + last run.
type: feature
---

## What runs automatically

- **Daily 03:00 UTC** — `cron.job 'billing-automation-daily'` hits edge function `run-billing-automation` which calls RPC `run_subscription_automation()` (renewals → retries → dunning → lifecycle transitions). Result logged as `subscription_events.event_type = 'automation.run'`.
- **Every 5 min** — `cron.job 'invoice-emails-dispatch'` hits `process-invoice-emails` to drain `invoice_email_queue`.

## Dunning email pipeline

`AFTER INSERT ON dunning_events` → trigger `enqueue_dunning_email`:
1. Reads `billing_profiles.billing_email`.
2. Inserts into `invoice_email_queue` with `template = 'dunning-' || stage` (`reminder|warning|limited_mode|suspension`).
3. Calls `log_subscription_event` with severity by stage.

`process-invoice-emails` dispatcher now template-aware — branches subject/body and `kind` field passed to `send-invoice-email` for: `dunning-reminder`, `dunning-warning`, `dunning-limited_mode`, `dunning-suspension`, default `invoice-issued`.

## Webhook scope unchanged

`payments-webhook` already handles `customer.subscription.*`, `invoice.paid/payment_failed`, `checkout.session.completed`, maps Stripe status to internal, logs each event. No code change required in Phase 6E.

## Manual override

`AutomationPanel` (Platform → Automação) keeps "Correr agora" button; now shows cron active indicator + last automation run timestamp from `subscription_events`.

## Files

- Migration `20260521153742_*` — pg_cron + pg_net + dunning trigger + 2 cron jobs.
- New: `supabase/functions/run-billing-automation/index.ts`.
- Edited: `supabase/functions/process-invoice-emails/index.ts` (template-aware), `src/components/billing/AutomationPanel.tsx` (cron + last run).

## Rollback

```sql
SELECT cron.unschedule('billing-automation-daily');
SELECT cron.unschedule('invoice-emails-dispatch');
DROP TRIGGER trg_dunning_email_enqueue ON dunning_events;
DROP FUNCTION enqueue_dunning_email();
```
Delete the new edge function. Revert dispatcher to single-template subject.
