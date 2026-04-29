CREATE OR REPLACE FUNCTION public.apply_order_owner(_requested_user_id uuid, _requested_assigned_user_id uuid, _old_user_id uuid, _old_assigned_user_id uuid, _created_by uuid, _old_created_by uuid, _is_insert boolean)
RETURNS TABLE(user_id uuid, assigned_user_id uuid, created_by uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_can_manage_all boolean;
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authenticated user is required to save orders.';
  END IF;

  v_can_manage_all := public.can_manage_all_orders(v_uid);

  IF _is_insert THEN
    IF v_can_manage_all THEN
      v_owner := COALESCE(_requested_user_id, _requested_assigned_user_id, v_uid);
    ELSE
      v_owner := v_uid;
    END IF;

    user_id := v_owner;
    assigned_user_id := v_owner;
    created_by := COALESCE(_created_by, v_uid);
  ELSE
    IF v_can_manage_all THEN
      v_owner := COALESCE(_requested_user_id, _requested_assigned_user_id, _old_user_id, _old_assigned_user_id, v_uid);
    ELSE
      v_owner := COALESCE(_old_user_id, _old_assigned_user_id, v_uid);
    END IF;

    user_id := v_owner;
    assigned_user_id := v_owner;
    created_by := COALESCE(_old_created_by, _created_by, v_uid);
  END IF;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.force_service_orders_auth_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner record;
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

  NEW.user_id := v_owner.user_id;
  NEW.assigned_user_id := v_owner.assigned_user_id;
  NEW.created_by := v_owner.created_by;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.force_payment_orders_auth_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner record;
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

  NEW.user_id := v_owner.user_id;
  NEW.assigned_user_id := v_owner.assigned_user_id;
  NEW.created_by := v_owner.created_by;
  RETURN NEW;
END;
$$;