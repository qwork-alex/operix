-- Replace INSERT policy on service_orders
DROP POLICY IF EXISTS secure_insert ON public.service_orders;

CREATE POLICY secure_insert
ON public.service_orders
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    technician_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.technicians t
      WHERE t.id = service_orders.technician_id
        AND t.user_id = auth.uid()
    )
  )
);

-- Replace SELECT policy on service_orders (keep prior behaviors + explicit technician ownership)
DROP POLICY IF EXISTS secure_select ON public.service_orders;

CREATE POLICY secure_select
ON public.service_orders
FOR SELECT
TO authenticated
USING (
  public.has_global_view(auth.uid())
  OR (
    technician_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.technicians t
      WHERE t.id = service_orders.technician_id
        AND t.user_id = auth.uid()
    )
  )
  OR (client_id IS NOT NULL AND public.can_access_client(auth.uid(), client_id))
);
