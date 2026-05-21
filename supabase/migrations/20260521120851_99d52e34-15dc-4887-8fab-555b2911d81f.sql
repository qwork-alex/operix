
-- Phase 3: Invoice generation + subscription activation RPCs

CREATE OR REPLACE FUNCTION public.generate_platform_invoice(
  _workspace_id uuid,
  _plan_code text,
  _cycle text,
  _vat_mode text,           -- 'personal' | 'business'
  _bank_account_id uuid DEFAULT NULL,
  _amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile billing_profiles%ROWTYPE;
  v_sub workspace_subscriptions%ROWTYPE;
  v_plan record;
  v_vat jsonb;
  v_subtotal numeric;
  v_rate numeric := 0;
  v_vat_amount numeric := 0;
  v_total numeric;
  v_number text;
  v_invoice_id uuid;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_is_business boolean := (_vat_mode = 'business');
BEGIN
  SELECT * INTO v_profile FROM billing_profiles WHERE workspace_id = _workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_profile_missing';
  END IF;

  SELECT * INTO v_sub FROM workspace_subscriptions WHERE workspace_id = _workspace_id;

  SELECT * INTO v_plan FROM subscription_plans WHERE code = _plan_code;

  v_subtotal := COALESCE(_amount, v_sub.current_price, 35);
  IF _cycle = 'yearly' THEN
    v_subtotal := v_subtotal * COALESCE(12 - v_plan.yearly_discount_months, 10);
  END IF;

  v_vat := calculate_vat(v_profile.country, v_is_business, v_profile.vat_number);
  v_rate := COALESCE((v_vat->>'rate')::numeric, 0);
  v_vat_amount := round(v_subtotal * v_rate, 2);
  v_total := v_subtotal + v_vat_amount;

  v_period_start := now();
  v_period_end := CASE WHEN _cycle = 'yearly' THEN now() + interval '1 year' ELSE now() + interval '1 month' END;

  v_number := next_platform_invoice_number();

  INSERT INTO platform_invoices (
    invoice_number, workspace_id, subscription_id, issue_date, due_date,
    currency, subtotal, vat_rate, vat_amount, vat_reverse_charge, vat_exemption_reason, total,
    status, customer_name, customer_country, customer_vat_number, customer_is_business, customer_address,
    metadata
  ) VALUES (
    v_number, _workspace_id, v_sub.id, now()::date, (now() + interval '14 days')::date,
    COALESCE(v_profile.preferred_currency, 'EUR'),
    v_subtotal, v_rate, v_vat_amount,
    COALESCE((v_vat->>'reverse_charge')::boolean, false),
    v_vat->>'exemption',
    v_total,
    'issued',
    COALESCE(v_profile.company_name, v_profile.legal_name),
    v_profile.country,
    v_profile.vat_number,
    v_is_business,
    concat_ws(', ', v_profile.billing_address, v_profile.postal_code, v_profile.city),
    jsonb_build_object(
      'plan', _plan_code,
      'cycle', _cycle,
      'vat_mode', _vat_mode,
      'bank_account_id', _bank_account_id,
      'period_start', v_period_start,
      'period_end', v_period_end
    )
  ) RETURNING id INTO v_invoice_id;

  PERFORM log_subscription_event(
    _workspace_id, 'invoice_generated', 'info',
    'Fatura ' || v_number || ' emitida',
    jsonb_build_object('invoice_id', v_invoice_id, 'total', v_total)
  );

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'invoice_number', v_number,
    'subtotal', v_subtotal,
    'vat_rate', v_rate,
    'vat_amount', v_vat_amount,
    'total', v_total,
    'period_start', v_period_start,
    'period_end', v_period_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_platform_invoice(uuid, text, text, text, uuid, numeric) TO authenticated;


CREATE OR REPLACE FUNCTION public.activate_workspace_subscription(
  _workspace_id uuid,
  _plan_code text,
  _cycle text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub workspace_subscriptions%ROWTYPE;
  v_plan_id uuid;
  v_period_end timestamptz;
BEGIN
  SELECT id INTO v_plan_id FROM subscription_plans WHERE code = _plan_code;
  IF v_plan_id IS NULL THEN RAISE EXCEPTION 'plan_not_found'; END IF;

  SELECT * INTO v_sub FROM workspace_subscriptions WHERE workspace_id = _workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;

  -- Idempotency guard: do not re-activate already active subs in the same minute
  IF v_sub.status = 'active' AND v_sub.current_period_end IS NOT NULL
     AND v_sub.current_period_end > now() THEN
    RETURN jsonb_build_object('already_active', true, 'subscription_id', v_sub.id);
  END IF;

  v_period_end := CASE WHEN _cycle = 'yearly' THEN now() + interval '1 year' ELSE now() + interval '1 month' END;

  UPDATE workspace_subscriptions
  SET status = 'active',
      plan_id = v_plan_id,
      billing_cycle = _cycle,
      current_period_start = now(),
      current_period_end = v_period_end,
      trial_ends_at = LEAST(trial_ends_at, now()),
      cancelled_at = NULL,
      legal_hold = false,
      updated_at = now()
  WHERE id = v_sub.id;

  PERFORM log_subscription_event(
    _workspace_id, 'subscription_activated', 'success',
    'Assinatura ativada (' || _plan_code || ' / ' || _cycle || ')',
    jsonb_build_object('plan', _plan_code, 'cycle', _cycle, 'period_end', v_period_end)
  );

  RETURN jsonb_build_object('subscription_id', v_sub.id, 'activated_at', now(), 'period_end', v_period_end);
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_workspace_subscription(uuid, text, text) TO authenticated;


-- Seed personal Wise account if none exists with account_type='personal'
INSERT INTO platform_bank_accounts (account_name, bank_name, iban, bic, currency, country, account_type, is_primary, supported_methods, active, notes)
SELECT 'QWork (Personal)', 'Wise', 'BE00 0000 0000 0000', 'TRWIBEB1XXX', 'EUR', 'BE', 'personal', false,
       ARRAY['bank_transfer','wise'], true, 'Personal Wise account (no VAT invoices)'
WHERE NOT EXISTS (SELECT 1 FROM platform_bank_accounts WHERE account_type = 'personal' AND active);
