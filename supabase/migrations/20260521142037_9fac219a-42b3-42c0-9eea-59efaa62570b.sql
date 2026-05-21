ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_lookup_key text,
  ADD COLUMN IF NOT EXISTS stripe_environment text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_subs_stripe_sub
  ON public.workspace_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ws_subs_stripe_customer
  ON public.workspace_subscriptions(stripe_customer_id);

ALTER TABLE public.billing_invoices
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

CREATE INDEX IF NOT EXISTS idx_billing_invoices_stripe_invoice
  ON public.billing_invoices(stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.parse_stripe_lookup_key(_key text)
RETURNS TABLE(plan_code text, cycle text)
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    regexp_replace(_key, '_(monthly|yearly)$', ''),
    (regexp_match(_key, '_(monthly|yearly)$'))[1];
$$;