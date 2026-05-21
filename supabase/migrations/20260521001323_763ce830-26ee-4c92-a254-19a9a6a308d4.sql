-- =========================================================
-- PHASE 4: Subscription & Billing Foundation (no Stripe yet)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.platform_owners (
  user_id uuid PRIMARY KEY,
  email text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_owners ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_owners (user_id, email, notes)
SELECT u.id, u.email, 'bootstrap'
FROM auth.users u
WHERE lower(u.email) = 'qwork@qworkgroup.com'
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_platform_owner(_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.platform_owners WHERE user_id = _uid
  );
$$;

CREATE POLICY "platform_owners_select" ON public.platform_owners
  FOR SELECT USING (public.is_platform_owner(auth.uid()));
CREATE POLICY "platform_owners_manage" ON public.platform_owners
  FOR ALL USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

-- Plans catalog
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  base_price_monthly numeric(10,2) NOT NULL DEFAULT 35.00,
  base_tech_included integer NOT NULL DEFAULT 20,
  extra_block_size integer NOT NULL DEFAULT 20,
  extra_block_price numeric(10,2) NOT NULL DEFAULT 10.00,
  yearly_discount_months integer NOT NULL DEFAULT 2,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

INSERT INTO public.subscription_plans (code, name)
VALUES ('base', 'QW Nexus Base')
ON CONFLICT (code) DO NOTHING;

CREATE POLICY "plans_select_authenticated" ON public.subscription_plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "plans_manage_platform" ON public.subscription_plans
  FOR ALL USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

-- Enums
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM
    ('trial', 'active', 'grace_period', 'overdue', 'suspended', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_cycle AS ENUM ('monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  status public.subscription_status NOT NULL DEFAULT 'trial',
  billing_cycle public.billing_cycle NOT NULL DEFAULT 'monthly',
  trial_started_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_until timestamptz,
  cancelled_at timestamptz,
  technician_count integer NOT NULL DEFAULT 0,
  current_price numeric(10,2) NOT NULL DEFAULT 35.00,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_workspace_subscriptions_updated_at ON public.workspace_subscriptions;
CREATE TRIGGER trg_workspace_subscriptions_updated_at
  BEFORE UPDATE ON public.workspace_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.workspace_subscriptions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_user_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_subscription_events_workspace
  ON public.subscription_events(workspace_id, created_at DESC);

-- workspace admin helper (owner OR membership role admin/socio)
CREATE OR REPLACE FUNCTION public.is_workspace_admin(_workspace_id uuid, _uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.app_users au ON au.id = w.owner_user_id
      WHERE w.id = _workspace_id AND au.auth_user_id = _uid
    )
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      JOIN public.app_users au ON au.id = m.user_id
      WHERE m.workspace_id = _workspace_id
        AND au.auth_user_id = _uid
        AND m.role::text IN ('admin', 'socio')
        AND m.status = 'active'
    )
  );
$$;

CREATE POLICY "ws_subs_select_own" ON public.workspace_subscriptions
  FOR SELECT USING (
    public.is_platform_owner(auth.uid())
    OR public.is_workspace_admin(workspace_id, auth.uid())
  );
CREATE POLICY "ws_subs_update_own" ON public.workspace_subscriptions
  FOR UPDATE USING (
    public.is_platform_owner(auth.uid())
    OR public.is_workspace_admin(workspace_id, auth.uid())
  )
  WITH CHECK (
    public.is_platform_owner(auth.uid())
    OR public.is_workspace_admin(workspace_id, auth.uid())
  );
CREATE POLICY "ws_subs_platform_manage" ON public.workspace_subscriptions
  FOR ALL USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE POLICY "sub_events_select" ON public.subscription_events
  FOR SELECT USING (
    public.is_platform_owner(auth.uid())
    OR public.is_workspace_admin(workspace_id, auth.uid())
  );
CREATE POLICY "sub_events_insert_platform" ON public.subscription_events
  FOR INSERT WITH CHECK (public.is_platform_owner(auth.uid()));

-- Pricing
CREATE OR REPLACE FUNCTION public.calc_subscription_price(
  _tech_count integer,
  _cycle public.billing_cycle DEFAULT 'monthly',
  _plan_code text DEFAULT 'base'
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan public.subscription_plans%ROWTYPE;
  v_extra_blocks integer;
  v_monthly numeric(10,2);
BEGIN
  SELECT * INTO v_plan FROM public.subscription_plans WHERE code = _plan_code LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;
  _tech_count := GREATEST(COALESCE(_tech_count, 0), 0);
  v_extra_blocks := CEIL(GREATEST(_tech_count - v_plan.base_tech_included, 0)::numeric
                         / NULLIF(v_plan.extra_block_size, 0))::integer;
  v_monthly := v_plan.base_price_monthly + (v_extra_blocks * v_plan.extra_block_price);
  IF _cycle = 'yearly' THEN
    RETURN ROUND(v_monthly * (12 - v_plan.yearly_discount_months), 2);
  END IF;
  RETURN v_monthly;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_subscription(_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_tech_count integer;
  v_next_tier_at integer;
  v_next_price numeric(10,2);
  v_monthly numeric(10,2);
  v_yearly numeric(10,2);
  v_days_left integer;
BEGIN
  IF NOT (public.is_platform_owner(auth.uid())
          OR public.is_workspace_admin(_workspace_id, auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sub FROM public.workspace_subscriptions WHERE workspace_id = _workspace_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('exists', false); END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_sub.plan_id;

  SELECT COUNT(*) INTO v_tech_count FROM public.technicians t WHERE t.workspace_id = _workspace_id;

  v_monthly := public.calc_subscription_price(v_tech_count, 'monthly', v_plan.code);
  v_yearly  := public.calc_subscription_price(v_tech_count, 'yearly',  v_plan.code);

  v_next_tier_at := v_plan.base_tech_included
    + CEIL(GREATEST(v_tech_count - v_plan.base_tech_included + 1, 1)::numeric
           / v_plan.extra_block_size) * v_plan.extra_block_size;
  v_next_price := public.calc_subscription_price(v_next_tier_at, v_sub.billing_cycle, v_plan.code);

  v_days_left := GREATEST(EXTRACT(DAY FROM (v_sub.trial_ends_at - now()))::int, 0);

  RETURN jsonb_build_object(
    'exists', true,
    'subscription', to_jsonb(v_sub),
    'plan', to_jsonb(v_plan),
    'usage', jsonb_build_object(
      'technician_count', v_tech_count,
      'included', v_plan.base_tech_included,
      'next_tier_at', v_next_tier_at
    ),
    'pricing', jsonb_build_object(
      'current_monthly', v_monthly,
      'current_yearly', v_yearly,
      'next_tier_price', v_next_price
    ),
    'trial', jsonb_build_object(
      'is_trial', v_sub.status = 'trial',
      'days_left', v_days_left,
      'ends_at', v_sub.trial_ends_at
    )
  );
END;
$$;

-- Auto-provision new workspaces
CREATE OR REPLACE FUNCTION public.provision_workspace_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan_id uuid;
BEGIN
  SELECT id INTO v_plan_id FROM public.subscription_plans WHERE code = 'base' LIMIT 1;
  IF v_plan_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.workspace_subscriptions (workspace_id, plan_id, status, current_price)
  VALUES (NEW.id, v_plan_id, 'trial', 35.00)
  ON CONFLICT (workspace_id) DO NOTHING;
  INSERT INTO public.subscription_events (workspace_id, event_type, payload)
  VALUES (NEW.id, 'trial_started', jsonb_build_object('source', 'workspace_created'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_workspace_subscription ON public.workspaces;
CREATE TRIGGER trg_provision_workspace_subscription
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.provision_workspace_subscription();

-- Backfill
INSERT INTO public.workspace_subscriptions (workspace_id, plan_id, status, current_price)
SELECT w.id, p.id, 'trial', 35.00
FROM public.workspaces w
CROSS JOIN (SELECT id FROM public.subscription_plans WHERE code = 'base' LIMIT 1) p
WHERE NOT EXISTS (SELECT 1 FROM public.workspace_subscriptions s WHERE s.workspace_id = w.id)
ON CONFLICT (workspace_id) DO NOTHING;

REVOKE ALL ON public.platform_owners FROM anon;
REVOKE ALL ON public.workspace_subscriptions FROM anon;
REVOKE ALL ON public.subscription_events FROM anon;
REVOKE ALL ON public.subscription_plans FROM anon;