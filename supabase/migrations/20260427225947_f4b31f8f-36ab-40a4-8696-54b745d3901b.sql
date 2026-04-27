DROP POLICY IF EXISTS insert_service_orders ON public.service_orders;

CREATE POLICY insert_service_orders
ON public.service_orders
FOR INSERT
TO authenticated
WITH CHECK (
  assigned_user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)
);