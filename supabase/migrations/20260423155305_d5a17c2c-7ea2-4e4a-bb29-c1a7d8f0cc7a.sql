-- Drop existing scoped policies
DROP POLICY IF EXISTS service_orders_select_scoped ON public.service_orders;
DROP POLICY IF EXISTS service_orders_insert_scoped ON public.service_orders;
DROP POLICY IF EXISTS service_orders_update_scoped ON public.service_orders;
DROP POLICY IF EXISTS service_orders_delete_scoped ON public.service_orders;

-- SELECT: admin OR the technician this order belongs to
CREATE POLICY "select_own_or_admin"
ON public.service_orders
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR technician_id = public.get_my_technician_id()
);

-- INSERT: admin OR creating an order for self (as technician)
CREATE POLICY "insert_own_or_admin"
ON public.service_orders
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR technician_id = public.get_my_technician_id()
);

-- UPDATE: admin OR the technician this order belongs to
CREATE POLICY "update_own_or_admin"
ON public.service_orders
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR technician_id = public.get_my_technician_id()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR technician_id = public.get_my_technician_id()
);

-- DELETE: admin only
CREATE POLICY "delete_admin_only"
ON public.service_orders
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
);