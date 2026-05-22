
-- 1. plan taxonomy
DO $$ BEGIN
  CREATE TYPE public.plan_kind AS ENUM ('workspace','technician');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS kind public.plan_kind NOT NULL DEFAULT 'workspace',
  ADD COLUMN IF NOT EXISTS tier_min int,
  ADD COLUMN IF NOT EXISTS tier_max int,
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

-- 2. deactivate legacy plan and seed new ones
UPDATE public.subscription_plans SET is_active = false WHERE code = 'base';

INSERT INTO public.subscription_plans
  (code, name, base_price_monthly, base_tech_included, extra_block_size, extra_block_price, yearly_discount_months, is_active, kind, tier_min, tier_max, sort_order)
VALUES
  ('technician_pro', 'Technician Pro',  24.99, 1,  0, 0, 2, true, 'technician', NULL, NULL, 0),
  ('workspace_t1',   'Workspace T1',    24.99, 15, 0, 0, 2, true, 'workspace',  1,   15,   1),
  ('workspace_t2',   'Workspace T2',    44.99, 30, 0, 0, 2, true, 'workspace',  16,  30,   2),
  ('workspace_t3',   'Workspace T3',    59.99, 45, 0, 0, 2, true, 'workspace',  31,  45,   3),
  ('workspace_t4',   'Workspace T4',    79.99, 60, 0, 0, 2, true, 'workspace',  46,  60,   4)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  base_price_monthly = EXCLUDED.base_price_monthly,
  base_tech_included = EXCLUDED.base_tech_included,
  kind = EXCLUDED.kind,
  tier_min = EXCLUDED.tier_min,
  tier_max = EXCLUDED.tier_max,
  sort_order = EXCLUDED.sort_order,
  is_active = true;

-- 3. technician_subscriptions
CREATE TABLE IF NOT EXISTS public.technician_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  status text NOT NULL DEFAULT 'trial',
  billing_cycle text NOT NULL DEFAULT 'monthly',
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz DEFAULT (now() + interval '14 days'),
  cancelled_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_lookup_key text,
  stripe_environment text,
  current_price numeric(10,2) NOT NULL DEFAULT 24.99,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_technician_subscriptions_user ON public.technician_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_technician_subscriptions_stripe ON public.technician_subscriptions(stripe_subscription_id);

ALTER TABLE public.technician_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tech_sub_select_own" ON public.technician_subscriptions;
CREATE POLICY "tech_sub_select_own"
  ON public.technician_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tech_sub_service_write" ON public.technician_subscriptions;
CREATE POLICY "tech_sub_service_write"
  ON public.technician_subscriptions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.touch_technician_subscriptions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_technician_subscriptions_touch ON public.technician_subscriptions;
CREATE TRIGGER trg_technician_subscriptions_touch
  BEFORE UPDATE ON public.technician_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_technician_subscriptions_updated_at();

-- 4. read helper
CREATE OR REPLACE FUNCTION public.get_technician_subscription(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_sub public.technician_subscriptions%ROWTYPE; v_plan public.subscription_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM public.technician_subscriptions WHERE user_id = _user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('exists', false); END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_sub.plan_id;
  RETURN jsonb_build_object(
    'exists', true,
    'subscription', to_jsonb(v_sub),
    'plan', to_jsonb(v_plan)
  );
END $$;

-- 5. rewrite workspace recalculator to pick tier by tech count
CREATE OR REPLACE FUNCTION public.recalculate_workspace_subscription(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_new_plan public.subscription_plans%ROWTYPE;
  v_tech_count int;
  v_prev_price numeric; v_prev_count int; v_prev_plan_id uuid;
BEGIN
  SELECT * INTO v_sub FROM public.workspace_subscriptions
    WHERE workspace_id = _workspace_id ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','no_subscription'); END IF;

  SELECT COUNT(*)::int INTO v_tech_count
    FROM public.memberships
   WHERE workspace_id = _workspace_id
     AND role = 'tecnico'::membership_role
     AND status = 'active'::membership_status;

  -- choose workspace tier whose [tier_min, tier_max] contains the count;
  -- if count exceeds the largest tier, fall back to the largest active tier.
  SELECT * INTO v_new_plan FROM public.subscription_plans
    WHERE kind = 'workspace' AND is_active
      AND GREATEST(v_tech_count,1) BETWEEN COALESCE(tier_min,1) AND COALESCE(tier_max, 2147483647)
    ORDER BY sort_order ASC LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_new_plan FROM public.subscription_plans
      WHERE kind = 'workspace' AND is_active
      ORDER BY sort_order DESC LIMIT 1;
  END IF;

  v_prev_price := v_sub.current_price;
  v_prev_count := v_sub.technician_count;
  v_prev_plan_id := v_sub.plan_id;

  UPDATE public.workspace_subscriptions
     SET technician_count = v_tech_count,
         plan_id = v_new_plan.id,
         current_price = v_new_plan.base_price_monthly,
         last_recalculated_at = now(),
         updated_at = now()
   WHERE id = v_sub.id;

  IF v_new_plan.base_price_monthly <> v_prev_price OR v_new_plan.id <> v_prev_plan_id THEN
    INSERT INTO public.workspace_limit_snapshots
      (workspace_id, subscription_id, previous_count, new_count, previous_price, new_price, delta_price, reason)
    VALUES (_workspace_id, v_sub.id, v_prev_count, v_tech_count, v_prev_price, v_new_plan.base_price_monthly,
      (v_new_plan.base_price_monthly - v_prev_price),
      CASE WHEN v_new_plan.base_price_monthly > v_prev_price THEN 'upgrade' ELSE 'downgrade' END);
    PERFORM public.log_billing_audit(_workspace_id, v_sub.id, 'subscription',
      CASE WHEN v_new_plan.base_price_monthly > v_prev_price THEN 'upgrade' ELSE 'downgrade' END,
      CASE WHEN v_new_plan.base_price_monthly > v_prev_price THEN 'warning' ELSE 'info' END,
      format('Tier change: %s → %s techs, %.2f€ → %.2f€ (%s)',
        v_prev_count, v_tech_count, v_prev_price, v_new_plan.base_price_monthly, v_new_plan.code),
      jsonb_build_object('prev_count',v_prev_count,'new_count',v_tech_count,
        'prev_price',v_prev_price,'new_price',v_new_plan.base_price_monthly,
        'plan_code', v_new_plan.code));
  END IF;

  RETURN jsonb_build_object('ok',true,'technician_count',v_tech_count,
    'plan_code', v_new_plan.code,
    'previous_price',v_prev_price,'new_price',v_new_plan.base_price_monthly,
    'tier_changed', v_new_plan.id <> v_prev_plan_id);
END $$;

-- 6. backfill: move every existing workspace_subscription to T1 and let the
--    recalculator move it to the correct tier on next membership change.
UPDATE public.workspace_subscriptions ws
   SET plan_id = sp.id,
       current_price = sp.base_price_monthly,
       updated_at = now()
  FROM public.subscription_plans sp
 WHERE sp.code = 'workspace_t1';

-- run recalculation once for every existing workspace
DO $$
DECLARE ws_id uuid;
BEGIN
  FOR ws_id IN SELECT workspace_id FROM public.workspace_subscriptions LOOP
    PERFORM public.recalculate_workspace_subscription(ws_id);
  END LOOP;
END $$;
