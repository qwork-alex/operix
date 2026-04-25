-- Replace technician_id-based logic with assigned_user_id in RLS

-- 1) payment_orders: SELECT scope no longer falls back to technician_id
DROP POLICY IF EXISTS po_select_scoped ON public.payment_orders;
CREATE POLICY po_select_scoped ON public.payment_orders
FOR SELECT TO authenticated
USING (
  has_global_view(auth.uid())
  OR row_in_scope(auth.uid(), 'payment_orders'::text, 'view'::text, created_by, group_id)
  OR (assigned_user_id IS NOT NULL AND assigned_user_id = auth.uid())
  OR (client_id IS NOT NULL AND can_access_client(auth.uid(), client_id))
);

-- 2) service_orders: UPDATE now resolves via assigned_user_id (= auth.uid())
DROP POLICY IF EXISTS service_orders_update ON public.service_orders;
CREATE POLICY service_orders_update ON public.service_orders
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (assigned_user_id IS NOT NULL AND assigned_user_id = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (assigned_user_id IS NOT NULL AND assigned_user_id = auth.uid())
);