-- =====================================================================
-- Phase B2 — Consolidate ownership triggers (service_orders, payment_orders, financial_records)
-- Goal: fix "assignments disappear" bug + remove redundant competing triggers.
-- Reversible: re-create the dropped triggers from prior migrations.
-- =====================================================================

-- 1) New canonical owner resolver — assigned_user_id is INDEPENDENT of user_id.
--    This fixes the bug where admin UPDATE collapsed assigned_user_id := user_id.
CREATE OR REPLACE FUNCTION public.apply_order_owner(
  _requested_user_id uuid,
  _requested_assigned_user_id uuid,
  _old_user_id uuid,
  _old_assigned_user_id uuid,
  _created_by uuid,
  _old_created_by uuid,
  _is_insert boolean
)
RETURNS TABLE(user_id uuid, assigned_user_id uuid, created_by uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_manage_all boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authenticated user is required to save orders.';
  END IF;

  v_can_manage_all := public.can_manage_all_orders(v_uid);

  IF _is_insert THEN
    IF v_can_manage_all THEN
      -- Admin/partner may seed both columns explicitly; default to caller uid
      user_id          := COALESCE(_requested_user_id, _requested_assigned_user_id, v_uid);
      assigned_user_id := COALESCE(_requested_assigned_user_id, _requested_user_id, v_uid);
    ELSE
      -- Normal user is forced as owner; cannot pre-assign others
      user_id          := v_uid;
      assigned_user_id := v_uid;
    END IF;
    created_by := COALESCE(_created_by, v_uid);
  ELSE
    IF v_can_manage_all THEN
      -- Preserve OLD when NEW comes NULL (e.g. UI didn't resend the field)
      user_id          := COALESCE(_requested_user_id, _old_user_id, v_uid);
      assigned_user_id := COALESCE(_requested_assigned_user_id, _old_assigned_user_id, _old_user_id, v_uid);
    ELSE
      -- Non-admin update: lock ownership to existing values; cannot reassign
      user_id          := COALESCE(_old_user_id, v_uid);
      assigned_user_id := COALESCE(_old_assigned_user_id, _old_user_id, v_uid);
    END IF;
    created_by := COALESCE(_old_created_by, _created_by, v_uid);
  END IF;

  RETURN NEXT;
END;
$function$;

-- 2) Single consolidated trigger function for SO/PO (delegates to apply_order_owner)
CREATE OR REPLACE FUNCTION public.trg_apply_order_owner_so_po()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_owner record;
BEGIN
  SELECT * INTO v_owner
  FROM public.apply_order_owner(
    NEW.user_id,
    NEW.assigned_user_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.user_id ELSE NULL END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.assigned_user_id ELSE NULL END,
    NEW.created_by,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.created_by ELSE NULL END,
    TG_OP = 'INSERT'
  );
  NEW.user_id          := v_owner.user_id;
  NEW.assigned_user_id := v_owner.assigned_user_id;
  NEW.created_by       := v_owner.created_by;
  RETURN NEW;
END;
$function$;

-- 3) financial_records — keep independent assigned_user_id, drop competing triggers
CREATE OR REPLACE FUNCTION public.trg_apply_owner_financial_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_manage_all boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authenticated user is required to save financial records.';
  END IF;
  v_can_manage_all := public.can_manage_all_orders(v_uid);

  IF TG_OP = 'INSERT' THEN
    IF v_can_manage_all THEN
      NEW.user_id          := COALESCE(NEW.user_id, NEW.assigned_user_id, v_uid);
      NEW.assigned_user_id := COALESCE(NEW.assigned_user_id, NEW.user_id, v_uid);
    ELSE
      NEW.user_id          := v_uid;
      NEW.assigned_user_id := v_uid;
    END IF;
    NEW.created_by := COALESCE(NEW.created_by, v_uid);
  ELSE
    IF v_can_manage_all THEN
      NEW.user_id          := COALESCE(NEW.user_id, OLD.user_id, v_uid);
      NEW.assigned_user_id := COALESCE(NEW.assigned_user_id, OLD.assigned_user_id, OLD.user_id, v_uid);
    ELSE
      NEW.user_id          := COALESCE(OLD.user_id, v_uid);
      NEW.assigned_user_id := COALESCE(OLD.assigned_user_id, OLD.user_id, v_uid);
    END IF;
    NEW.created_by := COALESCE(OLD.created_by, NEW.created_by, v_uid);
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Drop redundant/competing triggers on the 3 tables
DROP TRIGGER IF EXISTS force_service_orders_auth_owner_trigger ON public.service_orders;
DROP TRIGGER IF EXISTS trg_set_created_by_service_orders        ON public.service_orders;

DROP TRIGGER IF EXISTS force_payment_orders_auth_owner_trigger  ON public.payment_orders;
DROP TRIGGER IF EXISTS trg_set_created_by_payment_orders        ON public.payment_orders;

DROP TRIGGER IF EXISTS force_financial_records_auth_owner_trigger ON public.financial_records;
DROP TRIGGER IF EXISTS set_user_id_financial_records              ON public.financial_records;
DROP TRIGGER IF EXISTS trg_set_created_by_financial_records       ON public.financial_records;

-- 5) Install single canonical trigger per table
DROP TRIGGER IF EXISTS trg_apply_owner_service_orders ON public.service_orders;
CREATE TRIGGER trg_apply_owner_service_orders
  BEFORE INSERT OR UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_apply_order_owner_so_po();

DROP TRIGGER IF EXISTS trg_apply_owner_payment_orders ON public.payment_orders;
CREATE TRIGGER trg_apply_owner_payment_orders
  BEFORE INSERT OR UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_apply_order_owner_so_po();

DROP TRIGGER IF EXISTS trg_apply_owner_financial_records ON public.financial_records;
CREATE TRIGGER trg_apply_owner_financial_records
  BEFORE INSERT OR UPDATE ON public.financial_records
  FOR EACH ROW EXECUTE FUNCTION public.trg_apply_owner_financial_records();

-- 6) Validation log
INSERT INTO public.rls_validation_logs(phase, check_name, sample)
VALUES
  ('B2', 'consolidate_owner_triggers',
   jsonb_build_object(
     'tables', jsonb_build_array('service_orders','payment_orders','financial_records'),
     'change', 'assigned_user_id is now independent of user_id; competing triggers removed',
     'fix',    'admin UPDATE no longer collapses assignment to user_id'
   ));