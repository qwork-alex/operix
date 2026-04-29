
-- ============================================================
-- SERVICE ORDERS
-- ============================================================
DROP POLICY IF EXISTS service_orders_select_authenticated ON public.service_orders;
DROP POLICY IF EXISTS service_orders_update_owner_or_admin ON public.service_orders;
DROP POLICY IF EXISTS service_orders_delete_owner_or_admin ON public.service_orders;

CREATE POLICY service_orders_select_role_based
ON public.service_orders FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR user_id = auth.uid()
  OR created_by = auth.uid()
  OR assigned_user_id = auth.uid()
);

CREATE POLICY service_orders_update_role_based
ON public.service_orders FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR user_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR user_id = auth.uid()
);

CREATE POLICY service_orders_delete_admin_only
ON public.service_orders FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- PAYMENT ORDERS
-- ============================================================
DROP POLICY IF EXISTS payment_orders_select_authenticated ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_update_owner_or_admin ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_delete_owner_or_admin ON public.payment_orders;

CREATE POLICY payment_orders_select_role_based
ON public.payment_orders FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR user_id = auth.uid()
  OR created_by = auth.uid()
  OR assigned_user_id = auth.uid()
);

CREATE POLICY payment_orders_update_role_based
ON public.payment_orders FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR user_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR user_id = auth.uid()
);

CREATE POLICY payment_orders_delete_admin_only
ON public.payment_orders FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- FINANCIAL RECORDS
-- ============================================================
DROP POLICY IF EXISTS financial_records_select_authenticated ON public.financial_records;
DROP POLICY IF EXISTS financial_records_update_owner_or_admin ON public.financial_records;
DROP POLICY IF EXISTS financial_records_delete_owner_or_admin ON public.financial_records;

CREATE POLICY financial_records_select_role_based
ON public.financial_records FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR user_id = auth.uid()
  OR created_by = auth.uid()
  OR assigned_user_id = auth.uid()
);

CREATE POLICY financial_records_update_role_based
ON public.financial_records FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR user_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR user_id = auth.uid()
);

CREATE POLICY financial_records_delete_admin_only
ON public.financial_records FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- PROFILES (technicians see only themselves, admin/partner see all)
-- ============================================================
DROP POLICY IF EXISTS prof_select_auth ON public.profiles;

CREATE POLICY prof_select_role_based
ON public.profiles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR id = auth.uid()
);

-- ============================================================
-- APP USERS (users directory)
-- ============================================================
DROP POLICY IF EXISTS app_users_select_role_or_self ON public.app_users;

CREATE POLICY app_users_select_role_based
ON public.app_users FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR auth_user_id = auth.uid()
);

-- ============================================================
-- Backfill: ensure every auth user has a role (default technician)
-- ============================================================
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'technician'::app_role
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id)
ON CONFLICT DO NOTHING;
