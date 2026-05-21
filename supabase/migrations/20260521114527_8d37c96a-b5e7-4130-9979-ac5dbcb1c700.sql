
-- ============================================================================
-- Phase 2.5 — Billing Hardening & Access Enforcement
-- ============================================================================

-- 1. Extend subscription_status enum (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='past_due' AND enumtypid='subscription_status'::regtype) THEN
    ALTER TYPE subscription_status ADD VALUE 'past_due';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='legal_hold' AND enumtypid='subscription_status'::regtype) THEN
    ALTER TYPE subscription_status ADD VALUE 'legal_hold';
  END IF;
END $$;

-- 2. Extend workspace_subscriptions
ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS suspension_mode text
    CHECK (suspension_mode IN ('soft','hard')) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_recalculated_at timestamptz;

UPDATE public.workspace_subscriptions ws
   SET billing_owner_user_id = w.owner_user_id
  FROM public.workspaces w
 WHERE ws.workspace_id = w.id AND ws.billing_owner_user_id IS NULL;

-- ============================================================================
-- 3. Billing audit logs (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.workspace_subscriptions(id) ON DELETE SET NULL,
  category text NOT NULL,
  action text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bal_workspace ON public.billing_audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bal_category ON public.billing_audit_logs(category, created_at DESC);

ALTER TABLE public.billing_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bal_select_owner ON public.billing_audit_logs;
CREATE POLICY bal_select_owner ON public.billing_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_platform_owner(auth.uid()));

DROP POLICY IF EXISTS bal_insert_owner ON public.billing_audit_logs;
CREATE POLICY bal_insert_owner ON public.billing_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.bal_block_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'billing_audit_logs is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_bal_no_update ON public.billing_audit_logs;
CREATE TRIGGER trg_bal_no_update BEFORE UPDATE ON public.billing_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.bal_block_mutation();

DROP TRIGGER IF EXISTS trg_bal_no_delete ON public.billing_audit_logs;
CREATE TRIGGER trg_bal_no_delete BEFORE DELETE ON public.billing_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.bal_block_mutation();

-- ============================================================================
-- 4. Trial fingerprints
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.trial_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL,
  ip_hash text,
  owner_user_id uuid,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  trial_started_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_normalized)
);
ALTER TABLE public.trial_fingerprints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tf_owner_all ON public.trial_fingerprints;
CREATE POLICY tf_owner_all ON public.trial_fingerprints
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

-- ============================================================================
-- 5. Limit snapshots
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workspace_limit_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.workspace_subscriptions(id) ON DELETE SET NULL,
  previous_count int NOT NULL,
  new_count int NOT NULL,
  previous_price numeric NOT NULL,
  new_price numeric NOT NULL,
  delta_price numeric NOT NULL,
  reason text NOT NULL DEFAULT 'threshold_cross',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wls_workspace ON public.workspace_limit_snapshots(workspace_id, created_at DESC);
ALTER TABLE public.workspace_limit_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wls_owner_select ON public.workspace_limit_snapshots;
CREATE POLICY wls_owner_select ON public.workspace_limit_snapshots
  FOR SELECT TO authenticated
  USING (public.is_platform_owner(auth.uid()) OR public.is_workspace_member(auth.uid(), workspace_id));

-- ============================================================================
-- 6. Append-only audit logger
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_billing_audit(
  _workspace_id uuid, _subscription_id uuid, _category text, _action text,
  _severity text DEFAULT 'info', _message text DEFAULT NULL, _payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.billing_audit_logs
    (workspace_id, subscription_id, category, action, severity, message, payload, actor_user_id)
  VALUES (_workspace_id, _subscription_id, _category, _action, _severity, _message, COALESCE(_payload,'{}'::jsonb), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ============================================================================
-- 7. Access state — single source of truth
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_workspace_access_state(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_mode text;
  v_reasons jsonb := '[]'::jsonb;
  v_can_create boolean := true;
  v_can_edit boolean := true;
  v_can_export boolean := true;
  v_can_access_billing boolean := true;
  v_now timestamptz := now();
  v_days_left int := NULL;
BEGIN
  IF _workspace_id IS NULL THEN
    RETURN jsonb_build_object('access_mode','locked','reasons',jsonb_build_array('no_workspace'));
  END IF;
  SELECT * INTO v_sub FROM public.workspace_subscriptions
   WHERE workspace_id = _workspace_id ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('access_mode','full','status',NULL,'reasons',jsonb_build_array('no_subscription'),
      'can_create',true,'can_edit',true,'can_export',true,'can_access_billing',true);
  END IF;
  IF v_sub.legal_hold THEN
    RETURN jsonb_build_object('access_mode','locked','status',v_sub.status::text,
      'reasons',jsonb_build_array('legal_hold'),
      'can_create',false,'can_edit',false,'can_export',true,'can_access_billing',true,
      'subscription_id',v_sub.id);
  END IF;
  CASE v_sub.status::text
    WHEN 'trial' THEN
      v_days_left := GREATEST(0, EXTRACT(DAY FROM (v_sub.trial_ends_at - v_now))::int);
      IF v_sub.trial_ends_at < v_now THEN
        v_mode := 'billing_only'; v_can_create:=false; v_can_edit:=false;
        v_reasons := v_reasons || jsonb_build_array('trial_expired');
      ELSE
        v_mode := 'full';
        v_reasons := v_reasons || jsonb_build_array('trial_active');
      END IF;
    WHEN 'active' THEN v_mode := 'full';
    WHEN 'grace_period' THEN
      v_mode := 'full';
      v_reasons := v_reasons || jsonb_build_array('grace_period');
    WHEN 'past_due' THEN
      v_mode := 'readonly'; v_can_create:=false; v_can_edit:=false;
      v_reasons := v_reasons || jsonb_build_array('past_due');
    WHEN 'overdue' THEN
      v_mode := 'readonly'; v_can_create:=false; v_can_edit:=false;
      v_reasons := v_reasons || jsonb_build_array('overdue');
    WHEN 'suspended' THEN
      IF COALESCE(v_sub.suspension_mode,'soft') = 'hard' THEN
        v_mode := 'billing_only'; v_can_create:=false; v_can_edit:=false; v_can_export:=false;
        v_reasons := v_reasons || jsonb_build_array('suspended_hard');
      ELSE
        v_mode := 'readonly'; v_can_create:=false; v_can_edit:=false;
        v_reasons := v_reasons || jsonb_build_array('suspended_soft');
      END IF;
    WHEN 'cancelled' THEN
      v_mode := 'billing_only'; v_can_create:=false; v_can_edit:=false;
      v_reasons := v_reasons || jsonb_build_array('cancelled');
    ELSE v_mode := 'full';
  END CASE;

  RETURN jsonb_build_object(
    'access_mode', v_mode,
    'status', v_sub.status::text,
    'suspension_mode', v_sub.suspension_mode,
    'legal_hold', v_sub.legal_hold,
    'reasons', v_reasons,
    'can_create', v_can_create,
    'can_edit', v_can_edit,
    'can_export', v_can_export,
    'can_access_billing', v_can_access_billing,
    'trial_days_left', v_days_left,
    'subscription_id', v_sub.id,
    'workspace_id', _workspace_id
  );
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_access_state(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_workspace_access_state(uuid) TO authenticated;

-- ============================================================================
-- 8. Recalculate subscription
-- ============================================================================
CREATE OR REPLACE FUNCTION public.recalculate_workspace_subscription(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_tech_count int; v_extra int; v_blocks int;
  v_new_price numeric; v_prev_price numeric; v_prev_count int;
BEGIN
  SELECT * INTO v_sub FROM public.workspace_subscriptions
   WHERE workspace_id = _workspace_id ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','no_subscription'); END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_sub.plan_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','no_plan'); END IF;

  SELECT COUNT(*)::int INTO v_tech_count
    FROM public.memberships
   WHERE workspace_id = _workspace_id
     AND role = 'tecnico'::membership_role
     AND status = 'active'::membership_status;

  v_extra  := GREATEST(0, v_tech_count - v_plan.base_tech_included);
  v_blocks := CEIL(v_extra::numeric / v_plan.extra_block_size);
  v_new_price := v_plan.base_price_monthly + (v_blocks * v_plan.extra_block_price);

  v_prev_price := v_sub.current_price;
  v_prev_count := v_sub.technician_count;

  UPDATE public.workspace_subscriptions
     SET technician_count = v_tech_count,
         current_price    = v_new_price,
         last_recalculated_at = now(),
         updated_at = now()
   WHERE id = v_sub.id;

  IF v_new_price <> v_prev_price THEN
    INSERT INTO public.workspace_limit_snapshots
      (workspace_id, subscription_id, previous_count, new_count, previous_price, new_price, delta_price, reason)
    VALUES (_workspace_id, v_sub.id, v_prev_count, v_tech_count, v_prev_price, v_new_price, (v_new_price - v_prev_price),
      CASE WHEN v_new_price > v_prev_price THEN 'upgrade' ELSE 'downgrade' END);
    PERFORM public.log_billing_audit(_workspace_id, v_sub.id, 'subscription',
      CASE WHEN v_new_price > v_prev_price THEN 'upgrade' ELSE 'downgrade' END,
      CASE WHEN v_new_price > v_prev_price THEN 'warning' ELSE 'info' END,
      format('Tier change: %s → %s techs, %.2f€ → %.2f€', v_prev_count, v_tech_count, v_prev_price, v_new_price),
      jsonb_build_object('prev_count',v_prev_count,'new_count',v_tech_count,'prev_price',v_prev_price,'new_price',v_new_price));
  END IF;

  RETURN jsonb_build_object('ok',true,'technician_count',v_tech_count,
    'previous_price',v_prev_price,'new_price',v_new_price,'tier_changed',v_new_price <> v_prev_price);
END $$;
GRANT EXECUTE ON FUNCTION public.recalculate_workspace_subscription(uuid) TO authenticated;

-- ============================================================================
-- 9. Cross-workspace technician billing
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_technician_cross_workspace_billing(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_workspaces uuid[]; v_count int;
  v_first numeric := 20; v_extra numeric := 10; v_total numeric;
BEGIN
  SELECT COALESCE(array_agg(workspace_id), '{}'::uuid[]) INTO v_workspaces
    FROM public.memberships
   WHERE user_id = _user_id
     AND role = 'tecnico'::membership_role
     AND status = 'active'::membership_status;
  v_count := COALESCE(array_length(v_workspaces,1),0);
  IF v_count = 0 THEN
    RETURN jsonb_build_object('user_id',_user_id,'workspace_count',0,'total',0);
  END IF;
  v_total := v_first + GREATEST(0, v_count-1) * v_extra;
  RETURN jsonb_build_object('user_id',_user_id,'workspace_count',v_count,
    'workspaces',v_workspaces,'first_workspace_price',v_first,
    'additional_workspace_price',v_extra,'total',v_total);
END $$;
GRANT EXECUTE ON FUNCTION public.calculate_technician_cross_workspace_billing(uuid) TO authenticated;

-- ============================================================================
-- 10. State transition guard
-- ============================================================================
CREATE OR REPLACE FUNCTION public.transition_subscription_status(
  _workspace_id uuid, _new_status text, _reason text DEFAULT NULL, _suspension_mode text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_old text; v_allowed boolean := false;
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_sub FROM public.workspace_subscriptions
   WHERE workspace_id = _workspace_id ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  v_old := v_sub.status::text;
  v_allowed := CASE v_old
    WHEN 'trial'        THEN _new_status IN ('active','cancelled','suspended','legal_hold')
    WHEN 'active'       THEN _new_status IN ('grace_period','past_due','overdue','suspended','cancelled','legal_hold')
    WHEN 'grace_period' THEN _new_status IN ('active','past_due','overdue','suspended','cancelled','legal_hold')
    WHEN 'past_due'     THEN _new_status IN ('active','overdue','suspended','cancelled','legal_hold')
    WHEN 'overdue'      THEN _new_status IN ('active','suspended','cancelled','legal_hold')
    WHEN 'suspended'    THEN _new_status IN ('active','cancelled','legal_hold')
    WHEN 'cancelled'    THEN _new_status IN ('active','legal_hold')
    WHEN 'legal_hold'   THEN _new_status IN ('active','cancelled','suspended')
    ELSE false END;
  IF NOT v_allowed THEN
    PERFORM public.log_billing_audit(_workspace_id, v_sub.id, 'state','invalid_transition','warning',
      format('Blocked %s → %s', v_old, _new_status),
      jsonb_build_object('from',v_old,'to',_new_status,'reason',_reason));
    RAISE EXCEPTION 'invalid_transition: % -> %', v_old, _new_status;
  END IF;
  UPDATE public.workspace_subscriptions
     SET status = _new_status::subscription_status,
         suspension_mode = CASE WHEN _new_status='suspended' THEN COALESCE(_suspension_mode,'soft') ELSE NULL END,
         legal_hold = CASE WHEN _new_status='legal_hold' THEN true ELSE legal_hold END,
         cancelled_at = CASE WHEN _new_status='cancelled' THEN now() ELSE cancelled_at END,
         updated_at = now()
   WHERE id = v_sub.id;
  PERFORM public.log_billing_audit(_workspace_id, v_sub.id, 'state','status_transition','info',
    format('%s → %s', v_old, _new_status),
    jsonb_build_object('from',v_old,'to',_new_status,'reason',_reason,'suspension_mode',_suspension_mode));
  RETURN jsonb_build_object('ok',true,'from',v_old,'to',_new_status);
END $$;
GRANT EXECUTE ON FUNCTION public.transition_subscription_status(uuid,text,text,text) TO authenticated;

-- ============================================================================
-- 11. Trial eligibility
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_trial_eligibility(_email text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_norm text := lower(trim(_email)); v_existing public.trial_fingerprints%ROWTYPE;
BEGIN
  IF v_norm IS NULL OR v_norm = '' THEN
    RETURN jsonb_build_object('eligible',false,'reason','invalid_email');
  END IF;
  SELECT * INTO v_existing FROM public.trial_fingerprints WHERE email_normalized = v_norm;
  IF FOUND THEN
    RETURN jsonb_build_object('eligible',false,'reason','trial_already_used','previous_trial_at',v_existing.trial_started_at);
  END IF;
  RETURN jsonb_build_object('eligible',true);
END $$;
GRANT EXECUTE ON FUNCTION public.check_trial_eligibility(text) TO authenticated;

-- ============================================================================
-- 12. Triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_membership_recalc_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ws uuid;
BEGIN
  v_ws := COALESCE(NEW.workspace_id, OLD.workspace_id);
  IF v_ws IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF (TG_OP = 'INSERT' AND NEW.role = 'tecnico'::membership_role)
     OR (TG_OP = 'DELETE' AND OLD.role = 'tecnico'::membership_role)
     OR (TG_OP = 'UPDATE' AND (NEW.role = 'tecnico'::membership_role OR OLD.role = 'tecnico'::membership_role
                                OR NEW.status <> OLD.status)) THEN
    PERFORM public.recalculate_workspace_subscription(v_ws);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_membership_sub_recalc ON public.memberships;
CREATE TRIGGER trg_membership_sub_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.trg_membership_recalc_subscription();

CREATE OR REPLACE FUNCTION public.trg_subscription_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status <> OLD.status THEN
    PERFORM public.log_billing_audit(NEW.workspace_id, NEW.id, 'state','status_changed_db','info',
      format('%s → %s', OLD.status::text, NEW.status::text),
      jsonb_build_object('from',OLD.status::text,'to',NEW.status::text));
  END IF;
  IF NEW.legal_hold IS DISTINCT FROM OLD.legal_hold THEN
    PERFORM public.log_billing_audit(NEW.workspace_id, NEW.id, 'state','legal_hold_toggle','warning',
      CASE WHEN NEW.legal_hold THEN 'Legal hold ENABLED' ELSE 'Legal hold DISABLED' END,
      jsonb_build_object('legal_hold',NEW.legal_hold));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_subscription_audit_upd ON public.workspace_subscriptions;
CREATE TRIGGER trg_subscription_audit_upd
AFTER UPDATE ON public.workspace_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.trg_subscription_audit();

-- One-shot backfill of technician counts
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT workspace_id FROM public.workspace_subscriptions LOOP
    PERFORM public.recalculate_workspace_subscription(r.workspace_id);
  END LOOP;
END $$;
