-- ============================================================================
-- PHASE 1 — Platform Billing Infrastructure (owner-only, additive)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. platform_bank_accounts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  bank_name text NOT NULL,
  iban text,
  bic text,
  currency text NOT NULL DEFAULT 'EUR',
  country text NOT NULL DEFAULT 'FR',
  account_type text NOT NULL DEFAULT 'business',
  is_primary boolean NOT NULL DEFAULT false,
  supported_methods text[] NOT NULL DEFAULT ARRAY['bank_transfer','sepa']::text[],
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_platform_bank_accounts" ON public.platform_bank_accounts
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE TRIGGER trg_platform_bank_accounts_touch
  BEFORE UPDATE ON public.platform_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. platform_payment_methods (catalog)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_platform_payment_methods" ON public.platform_payment_methods
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE TRIGGER trg_platform_payment_methods_touch
  BEFORE UPDATE ON public.platform_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. platform_subscription_cycles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_subscription_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  subscription_id uuid,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'pending', -- pending|invoiced|paid|skipped|overdue
  invoice_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_subscription_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_platform_subscription_cycles" ON public.platform_subscription_cycles
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_psc_workspace ON public.platform_subscription_cycles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_psc_status ON public.platform_subscription_cycles(status);

CREATE TRIGGER trg_psc_touch
  BEFORE UPDATE ON public.platform_subscription_cycles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. platform_subscription_payments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid REFERENCES public.platform_subscription_cycles(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL,
  invoice_id uuid,
  method text NOT NULL DEFAULT 'bank_transfer', -- card|sepa|bank_transfer|apple_pay|google_pay|paypal
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'pending', -- pending|succeeded|failed|refunded
  bank_account_id uuid REFERENCES public.platform_bank_accounts(id) ON DELETE SET NULL,
  external_ref text,
  processed_at timestamptz,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_platform_subscription_payments" ON public.platform_subscription_payments
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_psp_workspace ON public.platform_subscription_payments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_psp_cycle ON public.platform_subscription_payments(cycle_id);

CREATE TRIGGER trg_psp_touch
  BEFORE UPDATE ON public.platform_subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. platform_vat_rules
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_vat_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL UNIQUE, -- ISO-2, or '__default__'
  standard_rate numeric(5,2) NOT NULL DEFAULT 0,
  eu_member boolean NOT NULL DEFAULT false,
  reverse_charge_when_business boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_vat_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_platform_vat_rules" ON public.platform_vat_rules
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE TRIGGER trg_pvr_touch
  BEFORE UPDATE ON public.platform_vat_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 6. platform_invoices
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.platform_invoice_number_seq;

CREATE TABLE IF NOT EXISTS public.platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  workspace_id uuid NOT NULL,
  subscription_id uuid,
  cycle_id uuid REFERENCES public.platform_subscription_cycles(id) ON DELETE SET NULL,
  issue_date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL DEFAULT (current_date + INTERVAL '14 days'),
  currency text NOT NULL DEFAULT 'EUR',
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 0,
  vat_amount numeric(10,2) NOT NULL DEFAULT 0,
  vat_reverse_charge boolean NOT NULL DEFAULT false,
  vat_exemption_reason text,
  total numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft', -- draft|pending|paid|overdue|cancelled|refunded
  customer_name text,
  customer_country text,
  customer_vat_number text,
  customer_is_business boolean NOT NULL DEFAULT false,
  customer_address jsonb,
  pdf_url text,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_platform_invoices" ON public.platform_invoices
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pi_workspace ON public.platform_invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pi_status ON public.platform_invoices(status);

CREATE TRIGGER trg_pi_touch
  BEFORE UPDATE ON public.platform_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 7. platform_invoice_items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.platform_invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_platform_invoice_items" ON public.platform_invoice_items
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pii_invoice ON public.platform_invoice_items(invoice_id);

-- ----------------------------------------------------------------------------
-- 8. platform_webhook_events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- pending|processed|failed
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_platform_webhook_events" ON public.platform_webhook_events
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pwe_status ON public.platform_webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_pwe_type ON public.platform_webhook_events(event_type);

-- ----------------------------------------------------------------------------
-- 9. Helper functions
-- ----------------------------------------------------------------------------

-- 9a. invoice number generator
CREATE OR REPLACE FUNCTION public.next_platform_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq bigint;
BEGIN
  v_seq := nextval('public.platform_invoice_number_seq');
  RETURN 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 6, '0');
END;
$$;

-- 9b. auto-set invoice_number on insert
CREATE OR REPLACE FUNCTION public.set_platform_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := public.next_platform_invoice_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pi_set_invoice_number
  BEFORE INSERT ON public.platform_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_platform_invoice_number();

-- 9c. VAT calculation
CREATE OR REPLACE FUNCTION public.calculate_vat(
  _country text,
  _is_business boolean DEFAULT false,
  _vat_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.platform_vat_rules%ROWTYPE;
  v_seller_country text := 'FR'; -- platform's home country
  v_rate numeric(5,2) := 0;
  v_reverse boolean := false;
  v_exemption text := NULL;
BEGIN
  SELECT * INTO v_rule FROM public.platform_vat_rules WHERE country = upper(_country) LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO v_rule FROM public.platform_vat_rules WHERE country = '__default__' LIMIT 1;
  END IF;

  IF v_rule.eu_member IS NOT TRUE THEN
    -- Outside EU: no VAT
    v_rate := 0;
    v_exemption := 'export_outside_eu';
  ELSIF upper(_country) = v_seller_country THEN
    -- Domestic: charge VAT
    v_rate := v_rule.standard_rate;
  ELSIF _is_business AND _vat_number IS NOT NULL AND length(trim(_vat_number)) > 4 THEN
    -- EU B2B with VAT number: reverse charge
    v_rate := 0;
    v_reverse := true;
    v_exemption := 'reverse_charge_art_196';
  ELSE
    -- EU B2C or business without VAT number: charge buyer's country VAT
    v_rate := v_rule.standard_rate;
  END IF;

  RETURN jsonb_build_object(
    'rate', v_rate,
    'reverse_charge', v_reverse,
    'exemption_reason', v_exemption,
    'country_resolved', COALESCE(v_rule.country, '__default__')
  );
END;
$$;

-- 9d. webhook emitter
CREATE OR REPLACE FUNCTION public.emit_platform_webhook_event(
  _event_type text,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.platform_webhook_events (event_type, payload)
  VALUES (_event_type, COALESCE(_payload, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 9e. invoice status transitions emit webhook events
CREATE OR REPLACE FUNCTION public.trg_platform_invoice_status_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'paid' THEN
      PERFORM public.emit_platform_webhook_event(
        'invoice_paid',
        jsonb_build_object('invoice_id', NEW.id, 'workspace_id', NEW.workspace_id, 'total', NEW.total)
      );
    ELSIF NEW.status = 'overdue' THEN
      PERFORM public.emit_platform_webhook_event(
        'invoice_overdue',
        jsonb_build_object('invoice_id', NEW.id, 'workspace_id', NEW.workspace_id, 'due_date', NEW.due_date)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pi_status_webhook
  AFTER UPDATE ON public.platform_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_platform_invoice_status_webhook();

-- 9f. payment success/failed emit webhook
CREATE OR REPLACE FUNCTION public.trg_platform_payment_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    IF NEW.status = 'succeeded' THEN
      PERFORM public.emit_platform_webhook_event(
        'payment_success',
        jsonb_build_object('payment_id', NEW.id, 'workspace_id', NEW.workspace_id, 'amount', NEW.amount)
      );
    ELSIF NEW.status = 'failed' THEN
      PERFORM public.emit_platform_webhook_event(
        'payment_failed',
        jsonb_build_object('payment_id', NEW.id, 'workspace_id', NEW.workspace_id, 'error', NEW.error_message)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_psp_webhook
  AFTER INSERT OR UPDATE ON public.platform_subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_platform_payment_webhook();

-- ----------------------------------------------------------------------------
-- 10. Seed data
-- ----------------------------------------------------------------------------

INSERT INTO public.platform_bank_accounts (account_name, bank_name, iban, bic, currency, country, account_type, is_primary, supported_methods, active, notes)
VALUES
  ('Wise Business', 'Wise', NULL, NULL, 'EUR', 'BE', 'business', true,  ARRAY['bank_transfer','sepa']::text[], true, 'Primary multi-currency account. Fill IBAN/BIC from Wise dashboard.'),
  ('CIC Business',  'CIC',  NULL, NULL, 'EUR', 'FR', 'business', false, ARRAY['bank_transfer','sepa']::text[], true, 'French business account. Fill IBAN/BIC from CIC.')
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_payment_methods (code, label, enabled, display_order) VALUES
  ('card',          'Carte bancaire',  true,  10),
  ('sepa',          'Prélèvement SEPA',true,  20),
  ('bank_transfer', 'Virement bancaire',true, 30),
  ('apple_pay',     'Apple Pay',       false, 40),
  ('google_pay',    'Google Pay',      false, 50),
  ('paypal',        'PayPal',          false, 60)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.platform_vat_rules (country, standard_rate, eu_member, reverse_charge_when_business, notes) VALUES
  ('FR', 20.00, true,  true,  'France (seller country)'),
  ('DE', 19.00, true,  true,  'Germany'),
  ('ES', 21.00, true,  true,  'Spain'),
  ('IT', 22.00, true,  true,  'Italy'),
  ('PT', 23.00, true,  true,  'Portugal'),
  ('BE', 21.00, true,  true,  'Belgium'),
  ('NL', 21.00, true,  true,  'Netherlands'),
  ('LU', 17.00, true,  true,  'Luxembourg'),
  ('__default__', 0.00, false, false, 'Non-EU default — no VAT')
ON CONFLICT (country) DO NOTHING;
