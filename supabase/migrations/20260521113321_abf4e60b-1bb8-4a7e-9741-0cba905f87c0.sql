
-- ============================================================
-- Phase 2: Checkout & Payment Architecture
-- ============================================================

-- 1. BILLING PROFILES
CREATE TABLE IF NOT EXISTS public.billing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  company_name text,
  billing_email text NOT NULL,
  billing_address text,
  city text,
  postal_code text,
  country text NOT NULL DEFAULT 'PT',
  vat_number text,
  is_business boolean NOT NULL DEFAULT true,
  preferred_currency text NOT NULL DEFAULT 'EUR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws admins manage billing profile" ON public.billing_profiles
  FOR ALL TO authenticated
  USING (
    public.is_platform_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      JOIN public.app_users au ON au.id = m.user_id
      WHERE m.workspace_id = billing_profiles.workspace_id
        AND au.auth_user_id = auth.uid()
        AND m.role = 'admin' AND m.status = 'active'
    )
  )
  WITH CHECK (
    public.is_platform_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      JOIN public.app_users au ON au.id = m.user_id
      WHERE m.workspace_id = billing_profiles.workspace_id
        AND au.auth_user_id = auth.uid()
        AND m.role = 'admin' AND m.status = 'active'
    )
  );

-- 2. PAYMENT METHODS (mock)
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('card','sepa','manual_transfer')),
  brand text,
  last4 text,
  holder_name text,
  iban_masked text,
  is_default boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'mock',
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws admins manage payment methods" ON public.payment_methods
  FOR ALL TO authenticated
  USING (
    public.is_platform_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      JOIN public.app_users au ON au.id = m.user_id
      WHERE m.workspace_id = payment_methods.workspace_id
        AND au.auth_user_id = auth.uid()
        AND m.role = 'admin' AND m.status = 'active'
    )
  )
  WITH CHECK (
    public.is_platform_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      JOIN public.app_users au ON au.id = m.user_id
      WHERE m.workspace_id = payment_methods.workspace_id
        AND au.auth_user_id = auth.uid()
        AND m.role = 'admin' AND m.status = 'active'
    )
  );

-- 3. SUBSCRIPTION EVENTS (timeline)
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.workspace_subscriptions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','error')),
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sub_events_ws ON public.subscription_events(workspace_id, created_at DESC);

CREATE POLICY "ws admins read subscription events" ON public.subscription_events
  FOR SELECT TO authenticated
  USING (
    public.is_platform_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      JOIN public.app_users au ON au.id = m.user_id
      WHERE m.workspace_id = subscription_events.workspace_id
        AND au.auth_user_id = auth.uid()
        AND m.role = 'admin' AND m.status = 'active'
    )
  );

-- 4. PAYMENT ATTEMPTS (retry ladder)
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.platform_invoices(id) ON DELETE CASCADE,
  attempt_number int NOT NULL DEFAULT 1,
  scheduled_at timestamptz NOT NULL,
  attempted_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','succeeded','failed','cancelled')),
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pay_attempts_ws ON public.payment_attempts(workspace_id, scheduled_at);

CREATE POLICY "ws admins read payment attempts" ON public.payment_attempts
  FOR SELECT TO authenticated
  USING (
    public.is_platform_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      JOIN public.app_users au ON au.id = m.user_id
      WHERE m.workspace_id = payment_attempts.workspace_id
        AND au.auth_user_id = auth.uid()
        AND m.role = 'admin' AND m.status = 'active'
    )
  );

-- 5. DUNNING EVENTS
CREATE TABLE IF NOT EXISTS public.dunning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.platform_invoices(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('reminder','warning','limited_mode','suspension')),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  days_overdue int NOT NULL,
  notified boolean NOT NULL DEFAULT false
);
ALTER TABLE public.dunning_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws admins read dunning" ON public.dunning_events
  FOR SELECT TO authenticated
  USING (
    public.is_platform_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      JOIN public.app_users au ON au.id = m.user_id
      WHERE m.workspace_id = dunning_events.workspace_id
        AND au.auth_user_id = auth.uid()
        AND m.role = 'admin' AND m.status = 'active'
    )
  );

-- 6. MANUAL BANK TRANSFERS
CREATE TABLE IF NOT EXISTS public.manual_bank_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.platform_invoices(id) ON DELETE SET NULL,
  reference_code text NOT NULL UNIQUE,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  bank_account_id uuid REFERENCES public.platform_bank_accounts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_manual_review' CHECK (status IN ('pending_manual_review','confirmed','rejected')),
  declared_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewer_notes text
);
ALTER TABLE public.manual_bank_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws admins manage manual transfers" ON public.manual_bank_transfers
  FOR ALL TO authenticated
  USING (
    public.is_platform_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      JOIN public.app_users au ON au.id = m.user_id
      WHERE m.workspace_id = manual_bank_transfers.workspace_id
        AND au.auth_user_id = auth.uid()
        AND m.role = 'admin' AND m.status = 'active'
    )
  )
  WITH CHECK (
    public.is_platform_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      JOIN public.app_users au ON au.id = m.user_id
      WHERE m.workspace_id = manual_bank_transfers.workspace_id
        AND au.auth_user_id = auth.uid()
        AND m.role = 'admin' AND m.status = 'active'
    )
  );

-- 7. Helper RPCs

CREATE OR REPLACE FUNCTION public.log_subscription_event(
  _workspace_id uuid,
  _event_type text,
  _severity text DEFAULT 'info',
  _message text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_sub uuid;
BEGIN
  SELECT id INTO v_sub FROM workspace_subscriptions WHERE workspace_id = _workspace_id LIMIT 1;
  INSERT INTO subscription_events(workspace_id, subscription_id, event_type, severity, message, metadata)
  VALUES (_workspace_id, v_sub, _event_type, _severity, _message, COALESCE(_metadata,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;$$;

CREATE OR REPLACE FUNCTION public.schedule_payment_retries(_invoice_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ws uuid; v_count int := 0;
BEGIN
  SELECT workspace_id INTO v_ws FROM platform_invoices WHERE id = _invoice_id;
  IF v_ws IS NULL THEN RETURN 0; END IF;
  INSERT INTO payment_attempts(workspace_id, invoice_id, attempt_number, scheduled_at)
  VALUES
    (v_ws, _invoice_id, 1, now() + interval '1 day'),
    (v_ws, _invoice_id, 2, now() + interval '3 days'),
    (v_ws, _invoice_id, 3, now() + interval '7 days');
  v_count := 3;
  PERFORM log_subscription_event(v_ws, 'payment_retries_scheduled', 'warning',
    'Scheduled 3 retry attempts for invoice', jsonb_build_object('invoice_id', _invoice_id));
  RETURN v_count;
END;$$;

CREATE OR REPLACE FUNCTION public.run_dunning_check()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; v_days int; v_stage text; v_created int := 0;
BEGIN
  FOR r IN
    SELECT id, workspace_id, due_date FROM platform_invoices
    WHERE status IN ('pending','overdue') AND due_date < CURRENT_DATE
  LOOP
    v_days := (CURRENT_DATE - r.due_date);
    v_stage := CASE
      WHEN v_days >= 30 THEN 'suspension'
      WHEN v_days >= 14 THEN 'limited_mode'
      WHEN v_days >= 7  THEN 'warning'
      WHEN v_days >= 3  THEN 'reminder'
      ELSE NULL END;
    IF v_stage IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM dunning_events WHERE invoice_id = r.id AND stage = v_stage
    ) THEN
      INSERT INTO dunning_events(workspace_id, invoice_id, stage, days_overdue)
      VALUES (r.workspace_id, r.id, v_stage, v_days);
      PERFORM log_subscription_event(r.workspace_id, 'dunning_' || v_stage, 'warning',
        'Invoice ' || v_days || ' days overdue', jsonb_build_object('invoice_id', r.id, 'days', v_days));
      v_created := v_created + 1;
    END IF;
  END LOOP;
  RETURN v_created;
END;$$;

CREATE OR REPLACE FUNCTION public.start_workspace_checkout(
  _workspace_id uuid,
  _plan_code text,
  _cycle text DEFAULT 'monthly'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_plan record; v_sub_id uuid;
BEGIN
  IF NOT (public.is_platform_owner(auth.uid()) OR EXISTS (
    SELECT 1 FROM memberships m JOIN app_users au ON au.id = m.user_id
    WHERE m.workspace_id = _workspace_id AND au.auth_user_id = auth.uid()
      AND m.role = 'admin' AND m.status = 'active'
  )) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_plan FROM subscription_plans WHERE code = _plan_code LIMIT 1;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'unknown plan'; END IF;
  SELECT id INTO v_sub_id FROM workspace_subscriptions WHERE workspace_id = _workspace_id;
  IF v_sub_id IS NULL THEN
    INSERT INTO workspace_subscriptions(workspace_id, plan_id, status, billing_cycle, trial_started_at, trial_ends_at)
    VALUES (_workspace_id, v_plan.id, 'payment_required', _cycle, now(), now() + interval '14 days')
    RETURNING id INTO v_sub_id;
  ELSE
    UPDATE workspace_subscriptions
    SET plan_id = v_plan.id, billing_cycle = _cycle, status = 'payment_required', updated_at = now()
    WHERE id = v_sub_id;
  END IF;
  PERFORM log_subscription_event(_workspace_id, 'checkout_started', 'info',
    'Checkout iniciado para plano ' || v_plan.code,
    jsonb_build_object('plan', v_plan.code, 'cycle', _cycle));
  RETURN jsonb_build_object('subscription_id', v_sub_id, 'plan', v_plan.code, 'cycle', _cycle);
END;$$;
