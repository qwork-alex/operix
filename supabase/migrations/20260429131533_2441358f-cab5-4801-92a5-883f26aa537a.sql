-- Normalize authenticated ownership at the database layer
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
    NEW.assigned_user_id := COALESCE(NEW.assigned_user_id, v_uid);
  ELSE
    NEW.user_id := COALESCE(OLD.user_id, v_uid);
    NEW.created_by := COALESCE(NEW.created_by, OLD.created_by, v_uid);
    NEW.assigned_user_id := COALESCE(NEW.assigned_user_id, OLD.assigned_user_id, v_uid);
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
    NEW.assigned_user_id := COALESCE(NEW.assigned_user_id, v_uid);
  ELSE
    NEW.user_id := COALESCE(OLD.user_id, v_uid);
    NEW.created_by := COALESCE(NEW.created_by, OLD.created_by, v_uid);
    NEW.assigned_user_id := COALESCE(NEW.assigned_user_id, OLD.assigned_user_id, v_uid);
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
    NEW.assigned_user_id := COALESCE(NEW.assigned_user_id, v_uid);
  ELSE
    NEW.user_id := COALESCE(OLD.user_id, v_uid);
    NEW.created_by := COALESCE(NEW.created_by, OLD.created_by, v_uid);
    NEW.assigned_user_id := COALESCE(NEW.assigned_user_id, OLD.assigned_user_id, v_uid);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.force_clients_auth_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authenticated user is required to save clients.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.user_id := v_uid;
    NEW.created_by := COALESCE(NEW.created_by, v_uid);
  ELSE
    NEW.user_id := COALESCE(OLD.user_id, v_uid);
    NEW.created_by := COALESCE(NEW.created_by, OLD.created_by, v_uid);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.force_company_settings_auth_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authenticated user is required to save company settings.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.user_id := v_uid;
  ELSE
    NEW.user_id := COALESCE(OLD.user_id, v_uid);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_service_orders_user_from_auth_trigger ON public.service_orders;
DROP TRIGGER IF EXISTS force_service_orders_auth_owner_trigger ON public.service_orders;
CREATE TRIGGER force_service_orders_auth_owner_trigger
BEFORE INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.force_service_orders_auth_owner();

DROP TRIGGER IF EXISTS set_payment_orders_user_from_auth_trigger ON public.payment_orders;
DROP TRIGGER IF EXISTS force_payment_orders_auth_owner_trigger ON public.payment_orders;
CREATE TRIGGER force_payment_orders_auth_owner_trigger
BEFORE INSERT OR UPDATE ON public.payment_orders
FOR EACH ROW EXECUTE FUNCTION public.force_payment_orders_auth_owner();

DROP TRIGGER IF EXISTS set_financial_records_user_from_auth_trigger ON public.financial_records;
DROP TRIGGER IF EXISTS force_financial_records_auth_owner_trigger ON public.financial_records;
CREATE TRIGGER force_financial_records_auth_owner_trigger
BEFORE INSERT OR UPDATE ON public.financial_records
FOR EACH ROW EXECUTE FUNCTION public.force_financial_records_auth_owner();

DROP TRIGGER IF EXISTS set_clients_user_from_auth_trigger ON public.clients;
DROP TRIGGER IF EXISTS force_clients_auth_owner_trigger ON public.clients;
CREATE TRIGGER force_clients_auth_owner_trigger
BEFORE INSERT OR UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.force_clients_auth_owner();

DROP TRIGGER IF EXISTS set_company_settings_user_from_auth_trigger ON public.company_settings;
DROP TRIGGER IF EXISTS force_company_settings_auth_owner_trigger ON public.company_settings;
CREATE TRIGGER force_company_settings_auth_owner_trigger
BEFORE INSERT OR UPDATE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.force_company_settings_auth_owner();

-- Ensure existing rows have a user owner where possible before tightening checks
UPDATE public.service_orders
SET user_id = COALESCE(user_id, created_by, assigned_user_id)
WHERE user_id IS NULL AND COALESCE(created_by, assigned_user_id) IS NOT NULL;

UPDATE public.payment_orders
SET user_id = COALESCE(user_id, created_by, assigned_user_id)
WHERE user_id IS NULL AND COALESCE(created_by, assigned_user_id) IS NOT NULL;

UPDATE public.financial_records
SET user_id = COALESCE(user_id, created_by, assigned_user_id)
WHERE user_id IS NULL AND COALESCE(created_by, assigned_user_id) IS NOT NULL;

UPDATE public.clients
SET user_id = COALESCE(user_id, created_by)
WHERE user_id IS NULL AND created_by IS NOT NULL;

-- Main table policies: authenticated create/read, owner update/delete, admin override
DROP POLICY IF EXISTS insert_service_orders ON public.service_orders;
DROP POLICY IF EXISTS select_service_orders ON public.service_orders;
DROP POLICY IF EXISTS service_orders_update ON public.service_orders;
DROP POLICY IF EXISTS service_orders_delete ON public.service_orders;

CREATE POLICY service_orders_insert_authenticated
ON public.service_orders
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY service_orders_select_authenticated
ON public.service_orders
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY service_orders_update_owner_or_admin
ON public.service_orders
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

CREATE POLICY service_orders_delete_owner_or_admin
ON public.service_orders
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

DROP POLICY IF EXISTS po_insert_scoped ON public.payment_orders;
DROP POLICY IF EXISTS po_select_scoped ON public.payment_orders;
DROP POLICY IF EXISTS po_update_scoped ON public.payment_orders;
DROP POLICY IF EXISTS po_delete_scoped ON public.payment_orders;

CREATE POLICY payment_orders_insert_authenticated
ON public.payment_orders
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY payment_orders_select_authenticated
ON public.payment_orders
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY payment_orders_update_owner_or_admin
ON public.payment_orders
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

CREATE POLICY payment_orders_delete_owner_or_admin
ON public.payment_orders
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

DROP POLICY IF EXISTS financial_records_insert_assigned ON public.financial_records;
DROP POLICY IF EXISTS financial_records_select_assigned ON public.financial_records;
DROP POLICY IF EXISTS financial_records_update_assigned ON public.financial_records;
DROP POLICY IF EXISTS financial_records_delete_admin ON public.financial_records;

CREATE POLICY financial_records_insert_authenticated
ON public.financial_records
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY financial_records_select_authenticated
ON public.financial_records
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY financial_records_update_owner_or_admin
ON public.financial_records
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

CREATE POLICY financial_records_delete_owner_or_admin
ON public.financial_records
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

DROP POLICY IF EXISTS clients_insert_scoped ON public.clients;
DROP POLICY IF EXISTS clients_select_scoped ON public.clients;
DROP POLICY IF EXISTS clients_update_scoped ON public.clients;
DROP POLICY IF EXISTS clients_delete_scoped ON public.clients;

CREATE POLICY clients_insert_authenticated
ON public.clients
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY clients_select_authenticated
ON public.clients
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY clients_update_owner_or_admin
ON public.clients
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

CREATE POLICY clients_delete_owner_or_admin
ON public.clients
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

-- Discrepancies are generated by backend reconciliation; allow authenticated read and admin writes only
DROP POLICY IF EXISTS disc_admin_all ON public.discrepancies;
DROP POLICY IF EXISTS disc_admin_partner_select ON public.discrepancies;

CREATE POLICY discrepancies_select_authenticated
ON public.discrepancies
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY discrepancies_admin_write
ON public.discrepancies
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- App user listing: admins/partners can list workspace users; users can always see themselves
DROP POLICY IF EXISTS au_select_self_or_admin ON public.app_users;
DROP POLICY IF EXISTS au_admin_all ON public.app_users;
DROP POLICY IF EXISTS au_insert_self ON public.app_users;

CREATE POLICY app_users_select_role_or_self
ON public.app_users
FOR SELECT TO authenticated
USING (
  auth_user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.app_users me
    WHERE me.auth_user_id = auth.uid()
      AND me.workspace_id IS NOT NULL
      AND me.workspace_id = app_users.workspace_id
  )
);

CREATE POLICY app_users_insert_self_or_admin
ON public.app_users
FOR INSERT TO authenticated
WITH CHECK (auth_user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY app_users_admin_update_delete
ON public.app_users
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Helpful indexes for owner checks
CREATE INDEX IF NOT EXISTS idx_service_orders_user_id ON public.service_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON public.payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_user_id ON public.financial_records(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_app_users_workspace_id ON public.app_users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_app_users_auth_user_id ON public.app_users(auth_user_id);