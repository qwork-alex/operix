-- Align order ownership with authenticated user ids and replace conflicting RLS policies

CREATE OR REPLACE FUNCTION public.can_manage_all_orders(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'partner'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.normalize_order_owner()
RETURNS trigger
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

  IF TG_OP = 'INSERT' THEN
    IF v_can_manage_all THEN
      v_owner := COALESCE(NEW.user_id, NEW.assigned_user_id, v_uid);
    ELSE
      v_owner := v_uid;
    END IF;

    NEW.created_by := COALESCE(NEW.created_by, v_uid);
  ELSE
    IF v_can_manage_all THEN
      v_owner := COALESCE(NEW.user_id, NEW.assigned_user_id, OLD.user_id, OLD.assigned_user_id, v_uid);
    ELSE
      v_owner := COALESCE(OLD.user_id, OLD.assigned_user_id, v_uid);
    END IF;

    NEW.created_by := COALESCE(OLD.created_by, NEW.created_by, v_uid);
  END IF;

  NEW.user_id := v_owner;
  NEW.assigned_user_id := v_owner;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.force_service_orders_auth_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.normalize_order_owner();
END;
$$;

CREATE OR REPLACE FUNCTION public.force_payment_orders_auth_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.normalize_order_owner();
END;
$$;

DROP TRIGGER IF EXISTS set_user_id_service_orders ON public.service_orders;
DROP TRIGGER IF EXISTS set_user_id_payment_orders ON public.payment_orders;
DROP TRIGGER IF EXISTS service_orders_enforce_tech_consistency ON public.service_orders;
DROP TRIGGER IF EXISTS payment_orders_enforce_tech_consistency ON public.payment_orders;

ALTER TABLE public.service_orders
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN assigned_user_id SET NOT NULL;

ALTER TABLE public.payment_orders
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN assigned_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_user_id ON public.service_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON public.payment_orders(user_id);

DROP POLICY IF EXISTS service_orders_insert_authenticated ON public.service_orders;
DROP POLICY IF EXISTS service_orders_select_role_based ON public.service_orders;
DROP POLICY IF EXISTS service_orders_update_role_based ON public.service_orders;
DROP POLICY IF EXISTS service_orders_delete_admin_only ON public.service_orders;
DROP POLICY IF EXISTS secure_select ON public.service_orders;
DROP POLICY IF EXISTS secure_update ON public.service_orders;
DROP POLICY IF EXISTS service_orders_select_scoped ON public.service_orders;
DROP POLICY IF EXISTS service_orders_update_scoped ON public.service_orders;
DROP POLICY IF EXISTS service_orders_insert_scoped ON public.service_orders;
DROP POLICY IF EXISTS service_orders_delete_scoped ON public.service_orders;

CREATE POLICY service_orders_insert_role_user_id
ON public.service_orders
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY service_orders_select_role_user_id
ON public.service_orders
FOR SELECT
TO authenticated
USING (
  public.can_manage_all_orders(auth.uid())
  OR user_id = auth.uid()
);

CREATE POLICY service_orders_update_role_user_id
ON public.service_orders
FOR UPDATE
TO authenticated
USING (
  public.can_manage_all_orders(auth.uid())
  OR user_id = auth.uid()
)
WITH CHECK (
  public.can_manage_all_orders(auth.uid())
  OR user_id = auth.uid()
);

CREATE POLICY service_orders_delete_admin_only
ON public.service_orders
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS payment_orders_insert_authenticated ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_select_role_based ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_update_role_based ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_delete_admin_only ON public.payment_orders;
DROP POLICY IF EXISTS po_select_scoped ON public.payment_orders;
DROP POLICY IF EXISTS po_update_scoped ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_select_scoped ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_update_scoped ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_insert_scoped ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_delete_scoped ON public.payment_orders;

CREATE POLICY payment_orders_insert_role_user_id
ON public.payment_orders
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY payment_orders_select_role_user_id
ON public.payment_orders
FOR SELECT
TO authenticated
USING (
  public.can_manage_all_orders(auth.uid())
  OR user_id = auth.uid()
);

CREATE POLICY payment_orders_update_role_user_id
ON public.payment_orders
FOR UPDATE
TO authenticated
USING (
  public.can_manage_all_orders(auth.uid())
  OR user_id = auth.uid()
)
WITH CHECK (
  public.can_manage_all_orders(auth.uid())
  OR user_id = auth.uid()
);

CREATE POLICY payment_orders_delete_admin_only
ON public.payment_orders
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS prof_select_role_based ON public.profiles;
CREATE POLICY prof_select_role_user_id
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.can_manage_all_orders(auth.uid())
  OR id = auth.uid()
);

DROP POLICY IF EXISTS app_users_select_role_based ON public.app_users;
CREATE POLICY app_users_select_role_user_id
ON public.app_users
FOR SELECT
TO authenticated
USING (
  public.can_manage_all_orders(auth.uid())
  OR auth_user_id = auth.uid()
);