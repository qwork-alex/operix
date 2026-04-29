
-- =========================================
-- SERVICE_ORDERS
-- =========================================
DROP POLICY IF EXISTS service_orders_delete_admin_only ON public.service_orders;
DROP POLICY IF EXISTS service_orders_insert_role_user_id ON public.service_orders;
DROP POLICY IF EXISTS service_orders_select_role_user_id ON public.service_orders;
DROP POLICY IF EXISTS service_orders_update_role_user_id ON public.service_orders;
DROP POLICY IF EXISTS service_orders_select_role_based ON public.service_orders;
DROP POLICY IF EXISTS service_orders_insert_role_based ON public.service_orders;
DROP POLICY IF EXISTS service_orders_update_role_based ON public.service_orders;
DROP POLICY IF EXISTS service_orders_delete_role_based ON public.service_orders;

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY so_select_rbac ON public.service_orders
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'partner'::public.app_role)
  OR user_id = auth.uid()
  OR assigned_user_id = auth.uid()
  OR created_by = auth.uid()
);

CREATE POLICY so_insert_rbac ON public.service_orders
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'partner'::public.app_role)
    OR user_id = auth.uid()
    OR user_id IS NULL  -- trigger normalize_order_owner preencherá
  )
);

CREATE POLICY so_update_rbac ON public.service_orders
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'partner'::public.app_role)
  OR user_id = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'partner'::public.app_role)
  OR user_id = auth.uid()
);

CREATE POLICY so_delete_admin ON public.service_orders
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- =========================================
-- PAYMENT_ORDERS
-- =========================================
DROP POLICY IF EXISTS payment_orders_delete_admin_only ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_insert_role_user_id ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_select_role_user_id ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_update_role_user_id ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_select_role_based ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_insert_role_based ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_update_role_based ON public.payment_orders;
DROP POLICY IF EXISTS payment_orders_delete_role_based ON public.payment_orders;

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY po_select_rbac ON public.payment_orders
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'partner'::public.app_role)
  OR user_id = auth.uid()
  OR assigned_user_id = auth.uid()
  OR created_by = auth.uid()
);

CREATE POLICY po_insert_rbac ON public.payment_orders
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'partner'::public.app_role)
    OR user_id = auth.uid()
    OR user_id IS NULL
  )
);

CREATE POLICY po_update_rbac ON public.payment_orders
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'partner'::public.app_role)
  OR user_id = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'partner'::public.app_role)
  OR user_id = auth.uid()
);

CREATE POLICY po_delete_admin ON public.payment_orders
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- =========================================
-- APP_USERS (lista de usuários)
-- =========================================
DROP POLICY IF EXISTS app_users_admin_update_delete ON public.app_users;
DROP POLICY IF EXISTS app_users_insert_self_or_admin ON public.app_users;
DROP POLICY IF EXISTS app_users_select_role_user_id ON public.app_users;

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- SELECT: admin e partner veem todos; técnico vê só a si mesmo
CREATE POLICY app_users_select_rbac ON public.app_users
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'partner'::public.app_role)
  OR auth_user_id = auth.uid()
);

-- INSERT: admin/partner podem criar qualquer; usuário pode criar o próprio registro
CREATE POLICY app_users_insert_rbac ON public.app_users
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'partner'::public.app_role)
  OR auth_user_id = auth.uid()
);

-- UPDATE: admin total, partner total, técnico só próprio
CREATE POLICY app_users_update_rbac ON public.app_users
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'partner'::public.app_role)
  OR auth_user_id = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'partner'::public.app_role)
  OR auth_user_id = auth.uid()
);

-- DELETE: somente admin
CREATE POLICY app_users_delete_admin ON public.app_users
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
