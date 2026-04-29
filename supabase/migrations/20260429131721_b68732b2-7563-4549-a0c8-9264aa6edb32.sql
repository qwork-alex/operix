CREATE OR REPLACE FUNCTION public.force_service_orders_auth_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authenticated user is required to save service orders.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.user_id := v_uid;
    NEW.created_by := COALESCE(NEW.created_by, v_uid);
    NEW.assigned_user_id := v_uid;
  ELSE
    NEW.user_id := COALESCE(OLD.user_id, v_uid);
    NEW.created_by := COALESCE(NEW.created_by, OLD.created_by, v_uid);
    NEW.assigned_user_id := COALESCE(OLD.assigned_user_id, NEW.assigned_user_id, v_uid);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.force_payment_orders_auth_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authenticated user is required to save payment orders.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.user_id := v_uid;
    NEW.created_by := COALESCE(NEW.created_by, v_uid);
    NEW.assigned_user_id := v_uid;
  ELSE
    NEW.user_id := COALESCE(OLD.user_id, v_uid);
    NEW.created_by := COALESCE(NEW.created_by, OLD.created_by, v_uid);
    NEW.assigned_user_id := COALESCE(OLD.assigned_user_id, NEW.assigned_user_id, v_uid);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.force_financial_records_auth_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authenticated user is required to save financial records.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.user_id := v_uid;
    NEW.created_by := COALESCE(NEW.created_by, v_uid);
    NEW.assigned_user_id := v_uid;
  ELSE
    NEW.user_id := COALESCE(OLD.user_id, v_uid);
    NEW.created_by := COALESCE(NEW.created_by, OLD.created_by, v_uid);
    NEW.assigned_user_id := COALESCE(OLD.assigned_user_id, NEW.assigned_user_id, v_uid);
  END IF;

  RETURN NEW;
END;
$$;