-- Helper: resolver technician_id do utilizador autenticado
CREATE OR REPLACE FUNCTION public.get_my_technician_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.technicians WHERE user_id = auth.uid() LIMIT 1
$$;

-- =========================================================
-- SERVICE_ORDERS
-- =========================================================
DROP POLICY IF EXISTS full_access_authenticated ON public.service_orders;

CREATE POLICY "service_orders_select_scoped"
ON public.service_orders FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'partner')
  OR (
    public.has_role(auth.uid(), 'technician')
    AND technician_id IS NOT NULL
    AND technician_id = public.get_my_technician_id()
  )
  OR (
    public.has_role(auth.uid(), 'client')
    AND client_id IS NOT NULL
    AND public.can_access_client(auth.uid(), client_id)
  )
);

CREATE POLICY "service_orders_insert_admin"
ON public.service_orders FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service_orders_update_admin"
ON public.service_orders FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service_orders_delete_admin"
ON public.service_orders FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- DOCUMENTS
-- =========================================================
DROP POLICY IF EXISTS full_access_authenticated ON public.documents;

CREATE POLICY "documents_select_scoped"
ON public.documents FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'partner')
  OR (
    public.has_role(auth.uid(), 'technician')
    AND service_order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = documents.service_order_id
        AND so.technician_id = public.get_my_technician_id()
    )
  )
);

CREATE POLICY "documents_insert_admin"
ON public.documents FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "documents_update_admin"
ON public.documents FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "documents_delete_admin"
ON public.documents FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- FINANCIAL_RECORDS
-- =========================================================
DROP POLICY IF EXISTS full_access_authenticated ON public.financial_records;

CREATE POLICY "financial_records_select_admin_partner"
ON public.financial_records FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'partner')
);

CREATE POLICY "financial_records_insert_admin"
ON public.financial_records FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "financial_records_update_admin"
ON public.financial_records FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "financial_records_delete_admin"
ON public.financial_records FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));