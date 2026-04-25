
DROP POLICY IF EXISTS "select_service_orders" ON public.service_orders;
DROP POLICY IF EXISTS service_orders_select ON public.service_orders;

CREATE POLICY "select_service_orders"
ON public.service_orders
FOR SELECT
TO authenticated
USING (true);
