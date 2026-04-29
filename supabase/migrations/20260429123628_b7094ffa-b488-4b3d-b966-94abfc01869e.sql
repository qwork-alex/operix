-- Replace the generic trigger with table-specific safe trigger functions
DROP TRIGGER IF EXISTS set_user_id_service_orders ON public.service_orders;
DROP TRIGGER IF EXISTS set_user_id_payment_orders ON public.payment_orders;
DROP TRIGGER IF EXISTS set_user_id_financial_records ON public.financial_records;
DROP TRIGGER IF EXISTS set_user_id_clients ON public.clients;
DROP TRIGGER IF EXISTS set_user_id_company_settings ON public.company_settings;

CREATE OR REPLACE FUNCTION public.set_service_orders_user_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.user_id := COALESCE(NEW.user_id, v_uid);
  NEW.created_by := COALESCE(NEW.created_by, v_uid);
  NEW.assigned_user_id := COALESCE(NEW.assigned_user_id, v_uid);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_payment_orders_user_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.user_id := COALESCE(NEW.user_id, v_uid);
  NEW.created_by := COALESCE(NEW.created_by, v_uid);
  NEW.assigned_user_id := COALESCE(NEW.assigned_user_id, v_uid);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_financial_records_user_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.user_id := COALESCE(NEW.user_id, v_uid);
  NEW.created_by := COALESCE(NEW.created_by, v_uid);
  NEW.assigned_user_id := COALESCE(NEW.assigned_user_id, v_uid);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_clients_user_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.user_id := COALESCE(NEW.user_id, v_uid);
  NEW.created_by := COALESCE(NEW.created_by, v_uid);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_company_settings_user_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.user_id := COALESCE(NEW.user_id, v_uid);
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_user_id_service_orders
BEFORE INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.set_service_orders_user_from_auth();

CREATE TRIGGER set_user_id_payment_orders
BEFORE INSERT OR UPDATE ON public.payment_orders
FOR EACH ROW EXECUTE FUNCTION public.set_payment_orders_user_from_auth();

CREATE TRIGGER set_user_id_financial_records
BEFORE INSERT OR UPDATE ON public.financial_records
FOR EACH ROW EXECUTE FUNCTION public.set_financial_records_user_from_auth();

CREATE TRIGGER set_user_id_clients
BEFORE INSERT OR UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.set_clients_user_from_auth();

CREATE TRIGGER set_user_id_company_settings
BEFORE INSERT OR UPDATE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.set_company_settings_user_from_auth();

REVOKE EXECUTE ON FUNCTION public.set_user_id_from_auth() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_service_orders_user_from_auth() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_payment_orders_user_from_auth() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_financial_records_user_from_auth() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_clients_user_from_auth() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_company_settings_user_from_auth() FROM anon, public;