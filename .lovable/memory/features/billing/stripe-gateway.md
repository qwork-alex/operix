---
name: Stripe Gateway Integration
description: Stripe wired as payment gateway only (checkout + recurring + portal + invoices + webhooks). Internal plans, pricing, lifecycle remain authoritative.
type: feature
---

## Boundary
- Stripe NEVER creates internal plans. `subscription_plans`, `workspace_subscriptions`, `get_workspace_subscription` stay authoritative.
- Stripe webhook only SYNCS state into existing tables.

## Mapping convention
- Stripe Price `lookup_key` = `{plan_code}_{cycle}` (e.g. `starter_monthly`, `pro_yearly`).
- Resolved server-side via `stripe.prices.list({ lookup_keys })` — stable sandbox↔live.
- Helper SQL: `parse_stripe_lookup_key(text)` returns `(plan_code, cycle)`.
- User creates products/prices manually in Stripe Dashboard. No automatic creation.

## DB additions
- `workspace_subscriptions`: `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_lookup_key`, `stripe_environment`.
- `billing_invoices`: `stripe_invoice_id`, `stripe_payment_intent_id`.

## Edge functions
- `_shared/stripe.ts` — gateway-routed Stripe client + `verifyWebhook`.
- `create-checkout` — embedded session by `lookup_key`. Resolves/creates Customer by `metadata.workspaceId`. `verify_jwt=false`.
- `create-portal-session` — opens Stripe Billing Portal. Verifies user from JWT in code. `verify_jwt=false`.
- `payments-webhook` — handles `customer.subscription.*`, `invoice.paid/payment_failed`, `checkout.session.completed`. Maps Stripe status → internal (`trialing→trial`, `past_due→overdue`, etc.). Logs to `subscription_events` via `log_subscription_event`. `verify_jwt=false`.

## Frontend
- `src/lib/stripe.ts` — `getStripe`, `getStripeEnvironment`, `isStripeConfigured` (derives env from `VITE_PAYMENTS_CLIENT_TOKEN` prefix).
- `StripeEmbeddedCheckout.tsx` — `EmbeddedCheckoutProvider` with stable `useMemo` options.
- `StripePortalButton.tsx` — opens portal in new tab.
- `CheckoutPage` step 5: `payKind="stripe"` renders inline embedded checkout. Other methods (manual_transfer, card, sepa) untouched.
- `SubscriptionPage`: Portal button next to Checkout.

## Security
- Customer lookup by `metadata.workspaceId` (workspace is the billing subject, not user).
- Webhook verifies HMAC-SHA256 signature with 5-min freshness window.
- `?env=sandbox|live` query param selects credentials.
