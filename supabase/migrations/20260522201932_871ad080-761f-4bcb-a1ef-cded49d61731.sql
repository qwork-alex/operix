
CREATE OR REPLACE FUNCTION public.calc_subscription_price(
  _tech_count integer,
  _cycle billing_cycle DEFAULT 'monthly'::billing_cycle,
  _plan_code text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan public.subscription_plans%ROWTYPE;
  v_monthly numeric(10,2);
BEGIN
  _tech_count := GREATEST(COALESCE(_tech_count, 0), 0);

  -- Pick the workspace tier whose range covers the count. Fallback to largest tier.
  SELECT * INTO v_plan FROM public.subscription_plans
    WHERE kind = 'workspace' AND is_active
      AND GREATEST(_tech_count, 1) BETWEEN COALESCE(tier_min, 1) AND COALESCE(tier_max, 2147483647)
    ORDER BY sort_order ASC LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_plan FROM public.subscription_plans
      WHERE kind = 'workspace' AND is_active
      ORDER BY sort_order DESC LIMIT 1;
  END IF;

  IF NOT FOUND THEN RETURN 0; END IF;

  v_monthly := v_plan.base_price_monthly;
  IF _cycle = 'yearly' THEN
    RETURN ROUND(v_monthly * GREATEST(12 - COALESCE(v_plan.yearly_discount_months, 0), 1), 2);
  END IF;
  RETURN v_monthly;
END $$;

CREATE OR REPLACE FUNCTION public.get_workspace_subscription(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_next_plan public.subscription_plans%ROWTYPE;
  v_tech_count int;
  v_next_tier_at int;
  v_days_left int;
BEGIN
  IF NOT (public.is_platform_owner(auth.uid())
          OR public.is_workspace_admin(_workspace_id, auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sub FROM public.workspace_subscriptions WHERE workspace_id = _workspace_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('exists', false); END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_sub.plan_id;

  SELECT COUNT(*)::int INTO v_tech_count
    FROM public.memberships
   WHERE workspace_id = _workspace_id
     AND role = 'tecnico'::membership_role
     AND status = 'active'::membership_status;

  -- next tier: the next plan whose tier_min > current plan's tier_max
  SELECT * INTO v_next_plan FROM public.subscription_plans
    WHERE kind = 'workspace' AND is_active
      AND COALESCE(tier_min, 0) > COALESCE(v_plan.tier_max, 0)
    ORDER BY sort_order ASC LIMIT 1;

  v_next_tier_at := COALESCE(v_next_plan.tier_min, v_plan.tier_max, v_tech_count + 1);

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
      'current_monthly', v_plan.base_price_monthly,
      'current_yearly',  ROUND(v_plan.base_price_monthly * GREATEST(12 - COALESCE(v_plan.yearly_discount_months, 0), 1), 2),
      'next_tier_price', COALESCE(v_next_plan.base_price_monthly, v_plan.base_price_monthly)
    ),
    'trial', jsonb_build_object(
      'is_trial', v_sub.status = 'trial',
      'days_left', v_days_left,
      'ends_at', v_sub.trial_ends_at
    )
  );
END $$;

-- All tiers in one shot for plan pickers
CREATE OR REPLACE FUNCTION public.list_workspace_tiers()
RETURNS TABLE (
  code text,
  name text,
  base_price_monthly numeric,
  yearly_price numeric,
  tier_min int,
  tier_max int,
  sort_order int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.code, p.name, p.base_price_monthly,
    ROUND(p.base_price_monthly * GREATEST(12 - COALESCE(p.yearly_discount_months, 0), 1), 2) AS yearly_price,
    p.tier_min, p.tier_max, p.sort_order
  FROM public.subscription_plans p
  WHERE p.kind = 'workspace' AND p.is_active
  ORDER BY p.sort_order ASC;
$$;
