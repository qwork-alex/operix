
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

  SELECT * INTO v_sub FROM workspace_subscriptions WHERE workspace_id = _workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;

  -- Fallback: keep current plan if the supplied code is not seeded yet
  IF v_plan_id IS NULL THEN
    v_plan_id := v_sub.plan_id;
  END IF;

  IF v_sub.status = 'active' AND v_sub.current_period_end IS NOT NULL
     AND v_sub.current_period_end > now() THEN
    RETURN jsonb_build_object('already_active', true, 'subscription_id', v_sub.id);
  END IF;

  v_period_end := CASE WHEN _cycle = 'yearly' THEN now() + interval '1 year' ELSE now() + interval '1 month' END;

  UPDATE workspace_subscriptions
  SET status = 'active',
      plan_id = COALESCE(v_plan_id, plan_id),
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
