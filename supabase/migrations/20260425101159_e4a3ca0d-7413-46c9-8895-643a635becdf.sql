-- 1. Drop ALL existing policies on service_orders to remove conflicts
DROP POLICY IF EXISTS secure_select ON public.service_orders;
DROP POLICY IF EXISTS secure_insert ON public.service_orders;
DROP POLICY IF EXISTS secure_update ON public.service_orders;
DROP POLICY IF EXISTS secure_delete ON public.service_orders;

-- 2. Ensure RLS stays enabled
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

-- 3. Clean INSERT policy — no get_my_technician_id() dependency
CREATE POLICY service_orders_insert
ON public.service_orders
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.technicians t
    WHERE t.id = service_orders.technician_id
      AND t.user_id = auth.uid()
  )
);

-- 4. SELECT policy
CREATE POLICY service_orders_select
ON public.service_orders
FOR SELECT
TO authenticated
USING (
  public.has_global_view(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.technicians t
    WHERE t.id = service_orders.technician_id
      AND t.user_id = auth.uid()
  )
  OR (client_id IS NOT NULL AND public.can_access_client(auth.uid(), client_id))
);

-- 5. UPDATE policy (mirrors insert rule)
CREATE POLICY service_orders_update
ON public.service_orders
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.technicians t
    WHERE t.id = service_orders.technician_id
      AND t.user_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.technicians t
    WHERE t.id = service_orders.technician_id
      AND t.user_id = auth.uid()
  )
);

-- 6. DELETE policy — admin only
CREATE POLICY service_orders_delete
ON public.service_orders
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 7. Debug audit trigger — logs auth.uid() + technician_id on every insert
CREATE OR REPLACE FUNCTION public.log_service_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.backend_event_logs (table_name, action, row_id, actor_user_id, payload)
  VALUES (
    'service_orders',
    'INSERT_AUDIT',
    NEW.id,
    auth.uid(),
    jsonb_build_object(
      'auth_uid', auth.uid(),
      'technician_id', NEW.technician_id,
      'technician_name', NEW.technician_name,
      'created_by', NEW.created_by
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_orders_insert_audit ON public.service_orders;
CREATE TRIGGER trg_service_orders_insert_audit
AFTER INSERT ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.log_service_order_insert();
