
DROP POLICY IF EXISTS "insert_service_orders" ON public.service_orders;
DROP POLICY IF EXISTS service_orders_insert ON public.service_orders;

CREATE POLICY "insert_service_orders"
ON public.service_orders
FOR INSERT
TO authenticated
WITH CHECK (
  assigned_user_id IS NOT NULL
);
