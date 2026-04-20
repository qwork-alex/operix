BEGIN;

DROP POLICY IF EXISTS service_orders_select_scoped ON public.service_orders;
DROP POLICY IF EXISTS service_orders_insert_admin ON public.service_orders;
DROP POLICY IF EXISTS service_orders_update_admin ON public.service_orders;
DROP POLICY IF EXISTS service_orders_delete_admin ON public.service_orders;

CREATE POLICY service_orders_select_scoped ON public.service_orders
FOR SELECT TO authenticated
USING (
  public.has_permission(auth.uid(), 'service_orders', 'view')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR (public.has_role(auth.uid(), 'technician') AND technician_id IS NOT NULL AND technician_id = public.get_my_technician_id())
    OR (public.has_role(auth.uid(), 'client') AND client_id IS NOT NULL AND public.can_access_client(auth.uid(), client_id))
  )
);

CREATE POLICY service_orders_insert_scoped ON public.service_orders
FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission(auth.uid(), 'service_orders', 'create')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR (public.has_role(auth.uid(), 'technician') AND technician_id IS NOT NULL AND technician_id = public.get_my_technician_id())
  )
);

CREATE POLICY service_orders_update_scoped ON public.service_orders
FOR UPDATE TO authenticated
USING (
  public.has_permission(auth.uid(), 'service_orders', 'edit')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR (public.has_role(auth.uid(), 'technician') AND technician_id IS NOT NULL AND technician_id = public.get_my_technician_id())
  )
)
WITH CHECK (
  public.has_permission(auth.uid(), 'service_orders', 'edit')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR (public.has_role(auth.uid(), 'technician') AND technician_id IS NOT NULL AND technician_id = public.get_my_technician_id())
  )
);

CREATE POLICY service_orders_delete_scoped ON public.service_orders
FOR DELETE TO authenticated
USING (
  public.has_permission(auth.uid(), 'service_orders', 'delete')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR (public.has_role(auth.uid(), 'technician') AND technician_id IS NOT NULL AND technician_id = public.get_my_technician_id())
  )
);

DROP POLICY IF EXISTS po_select_scoped ON public.payment_orders;
DROP POLICY IF EXISTS po_insert_admin ON public.payment_orders;
DROP POLICY IF EXISTS po_update_admin ON public.payment_orders;
DROP POLICY IF EXISTS po_delete_admin ON public.payment_orders;

CREATE POLICY po_select_scoped ON public.payment_orders
FOR SELECT TO authenticated
USING (
  public.has_permission(auth.uid(), 'payment_orders', 'view')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR (public.has_role(auth.uid(), 'technician') AND technician_id IS NOT NULL AND technician_id = public.get_my_technician_id())
    OR (public.has_role(auth.uid(), 'client') AND client_id IS NOT NULL AND public.can_access_client(auth.uid(), client_id))
  )
);

CREATE POLICY po_insert_scoped ON public.payment_orders
FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission(auth.uid(), 'payment_orders', 'create')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR (public.has_role(auth.uid(), 'technician') AND technician_id IS NOT NULL AND technician_id = public.get_my_technician_id())
  )
);

CREATE POLICY po_update_scoped ON public.payment_orders
FOR UPDATE TO authenticated
USING (
  public.has_permission(auth.uid(), 'payment_orders', 'edit')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR (public.has_role(auth.uid(), 'technician') AND technician_id IS NOT NULL AND technician_id = public.get_my_technician_id())
  )
)
WITH CHECK (
  public.has_permission(auth.uid(), 'payment_orders', 'edit')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR (public.has_role(auth.uid(), 'technician') AND technician_id IS NOT NULL AND technician_id = public.get_my_technician_id())
  )
);

CREATE POLICY po_delete_scoped ON public.payment_orders
FOR DELETE TO authenticated
USING (
  public.has_permission(auth.uid(), 'payment_orders', 'delete')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR (public.has_role(auth.uid(), 'technician') AND technician_id IS NOT NULL AND technician_id = public.get_my_technician_id())
  )
);

DROP POLICY IF EXISTS financial_records_select_admin_partner ON public.financial_records;
DROP POLICY IF EXISTS financial_records_insert_admin ON public.financial_records;
DROP POLICY IF EXISTS financial_records_update_admin ON public.financial_records;
DROP POLICY IF EXISTS financial_records_delete_admin ON public.financial_records;

CREATE POLICY financial_records_select_scoped ON public.financial_records
FOR SELECT TO authenticated
USING (
  public.has_permission(auth.uid(), 'financial', 'view')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR (
      public.has_role(auth.uid(), 'technician')
      AND (
        (service_order_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.service_orders so
          WHERE so.id = financial_records.service_order_id
            AND so.technician_id = public.get_my_technician_id()
        ))
        OR
        (payment_order_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.payment_orders po
          WHERE po.id = financial_records.payment_order_id
            AND po.technician_id = public.get_my_technician_id()
        ))
      )
    )
    OR (
      public.has_role(auth.uid(), 'client')
      AND (
        (service_order_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.service_orders so
          WHERE so.id = financial_records.service_order_id
            AND so.client_id IS NOT NULL
            AND public.can_access_client(auth.uid(), so.client_id)
        ))
        OR
        (payment_order_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.payment_orders po
          WHERE po.id = financial_records.payment_order_id
            AND po.client_id IS NOT NULL
            AND public.can_access_client(auth.uid(), po.client_id)
        ))
      )
    )
  )
);

CREATE POLICY financial_records_insert_scoped ON public.financial_records
FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission(auth.uid(), 'financial', 'create')
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner'))
);

CREATE POLICY financial_records_update_scoped ON public.financial_records
FOR UPDATE TO authenticated
USING (
  public.has_permission(auth.uid(), 'financial', 'edit')
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner'))
)
WITH CHECK (
  public.has_permission(auth.uid(), 'financial', 'edit')
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner'))
);

CREATE POLICY financial_records_delete_scoped ON public.financial_records
FOR DELETE TO authenticated
USING (
  public.has_permission(auth.uid(), 'financial', 'delete')
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner'))
);

DROP POLICY IF EXISTS documents_select_scoped ON public.documents;
DROP POLICY IF EXISTS documents_insert_admin ON public.documents;
DROP POLICY IF EXISTS documents_update_admin ON public.documents;
DROP POLICY IF EXISTS documents_delete_admin ON public.documents;

CREATE POLICY documents_select_scoped ON public.documents
FOR SELECT TO authenticated
USING (
  public.has_permission(auth.uid(), 'documents', 'view')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR uploaded_by = auth.uid()
    OR (
      public.has_role(auth.uid(), 'technician')
      AND service_order_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.service_orders so
        WHERE so.id = documents.service_order_id
          AND so.technician_id = public.get_my_technician_id()
      )
    )
    OR (
      public.has_role(auth.uid(), 'client')
      AND service_order_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.service_orders so
        WHERE so.id = documents.service_order_id
          AND so.client_id IS NOT NULL
          AND public.can_access_client(auth.uid(), so.client_id)
      )
    )
  )
);

CREATE POLICY documents_insert_scoped ON public.documents
FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission(auth.uid(), 'documents', 'create')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR uploaded_by = auth.uid()
  )
);

CREATE POLICY documents_update_scoped ON public.documents
FOR UPDATE TO authenticated
USING (
  public.has_permission(auth.uid(), 'documents', 'edit')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR uploaded_by = auth.uid()
  )
)
WITH CHECK (
  public.has_permission(auth.uid(), 'documents', 'edit')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR uploaded_by = auth.uid()
  )
);

CREATE POLICY documents_delete_scoped ON public.documents
FOR DELETE TO authenticated
USING (
  public.has_permission(auth.uid(), 'documents', 'delete')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR uploaded_by = auth.uid()
  )
);

DROP POLICY IF EXISTS tech_select ON public.technicians;
DROP POLICY IF EXISTS tech_admin_all ON public.technicians;

CREATE POLICY tech_select_scoped ON public.technicians
FOR SELECT TO authenticated
USING (
  (
    public.has_permission(auth.uid(), 'users', 'view')
    OR public.has_permission(auth.uid(), 'service_orders', 'view')
    OR public.has_permission(auth.uid(), 'payment_orders', 'view')
    OR public.has_permission(auth.uid(), 'financial', 'view')
    OR public.has_permission(auth.uid(), 'fleet', 'view')
  )
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR user_id = auth.uid()
  )
);

CREATE POLICY tech_insert_scoped ON public.technicians
FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission(auth.uid(), 'fleet', 'create')
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner'))
);

CREATE POLICY tech_update_scoped ON public.technicians
FOR UPDATE TO authenticated
USING (
  public.has_permission(auth.uid(), 'fleet', 'edit')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR user_id = auth.uid()
  )
)
WITH CHECK (
  public.has_permission(auth.uid(), 'fleet', 'edit')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR user_id = auth.uid()
  )
);

CREATE POLICY tech_delete_scoped ON public.technicians
FOR DELETE TO authenticated
USING (
  public.has_permission(auth.uid(), 'fleet', 'delete')
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner'))
);

DROP POLICY IF EXISTS clients_select ON public.clients;
DROP POLICY IF EXISTS clients_admin_all ON public.clients;

CREATE POLICY clients_select_scoped ON public.clients
FOR SELECT TO authenticated
USING (
  (
    public.has_permission(auth.uid(), 'service_orders', 'view')
    OR public.has_permission(auth.uid(), 'payment_orders', 'view')
    OR public.has_permission(auth.uid(), 'financial', 'view')
    OR public.has_permission(auth.uid(), 'documents', 'view')
  )
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'partner')
    OR public.can_access_client(auth.uid(), id)
  )
);

CREATE POLICY clients_insert_scoped ON public.clients
FOR INSERT TO authenticated
WITH CHECK (
  (
    public.has_permission(auth.uid(), 'service_orders', 'create')
    OR public.has_permission(auth.uid(), 'payment_orders', 'create')
    OR public.has_permission(auth.uid(), 'documents', 'create')
  )
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner'))
);

CREATE POLICY clients_update_scoped ON public.clients
FOR UPDATE TO authenticated
USING (
  (
    public.has_permission(auth.uid(), 'service_orders', 'edit')
    OR public.has_permission(auth.uid(), 'payment_orders', 'edit')
    OR public.has_permission(auth.uid(), 'documents', 'edit')
  )
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner'))
)
WITH CHECK (
  (
    public.has_permission(auth.uid(), 'service_orders', 'edit')
    OR public.has_permission(auth.uid(), 'payment_orders', 'edit')
    OR public.has_permission(auth.uid(), 'documents', 'edit')
  )
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner'))
);

CREATE POLICY clients_delete_scoped ON public.clients
FOR DELETE TO authenticated
USING (
  (
    public.has_permission(auth.uid(), 'service_orders', 'delete')
    OR public.has_permission(auth.uid(), 'payment_orders', 'delete')
    OR public.has_permission(auth.uid(), 'documents', 'delete')
  )
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'partner'))
);

COMMIT;