-- =========================================================
-- service_orders
-- =========================================================
DROP POLICY IF EXISTS service_orders_select_scoped ON public.service_orders;
DROP POLICY IF EXISTS service_orders_insert_scoped ON public.service_orders;
DROP POLICY IF EXISTS service_orders_update_scoped ON public.service_orders;
DROP POLICY IF EXISTS service_orders_delete_scoped ON public.service_orders;

CREATE POLICY service_orders_select_scoped ON public.service_orders
FOR SELECT TO authenticated
USING (
  has_permission(auth.uid(), 'service_orders', 'view')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR (technician_id IS NOT NULL AND technician_id = get_my_technician_id())
    OR (client_id IS NOT NULL AND can_access_client(auth.uid(), client_id))
    OR (
      NOT has_role(auth.uid(), 'technician'::app_role)
      AND NOT has_role(auth.uid(), 'client'::app_role)
    )
  )
);

CREATE POLICY service_orders_insert_scoped ON public.service_orders
FOR INSERT TO authenticated
WITH CHECK (
  has_permission(auth.uid(), 'service_orders', 'create')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR (technician_id IS NOT NULL AND technician_id = get_my_technician_id())
    OR (
      NOT has_role(auth.uid(), 'technician'::app_role)
      AND NOT has_role(auth.uid(), 'client'::app_role)
    )
  )
);

CREATE POLICY service_orders_update_scoped ON public.service_orders
FOR UPDATE TO authenticated
USING (
  has_permission(auth.uid(), 'service_orders', 'edit')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR (technician_id IS NOT NULL AND technician_id = get_my_technician_id())
    OR (
      NOT has_role(auth.uid(), 'technician'::app_role)
      AND NOT has_role(auth.uid(), 'client'::app_role)
    )
  )
)
WITH CHECK (
  has_permission(auth.uid(), 'service_orders', 'edit')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR (technician_id IS NOT NULL AND technician_id = get_my_technician_id())
    OR (
      NOT has_role(auth.uid(), 'technician'::app_role)
      AND NOT has_role(auth.uid(), 'client'::app_role)
    )
  )
);

CREATE POLICY service_orders_delete_scoped ON public.service_orders
FOR DELETE TO authenticated
USING (
  has_permission(auth.uid(), 'service_orders', 'delete')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR (technician_id IS NOT NULL AND technician_id = get_my_technician_id())
    OR (
      NOT has_role(auth.uid(), 'technician'::app_role)
      AND NOT has_role(auth.uid(), 'client'::app_role)
    )
  )
);

-- =========================================================
-- payment_orders
-- =========================================================
DROP POLICY IF EXISTS po_select_scoped ON public.payment_orders;
DROP POLICY IF EXISTS po_insert_scoped ON public.payment_orders;
DROP POLICY IF EXISTS po_update_scoped ON public.payment_orders;
DROP POLICY IF EXISTS po_delete_scoped ON public.payment_orders;

CREATE POLICY po_select_scoped ON public.payment_orders
FOR SELECT TO authenticated
USING (
  has_permission(auth.uid(), 'payment_orders', 'view')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR (technician_id IS NOT NULL AND technician_id = get_my_technician_id())
    OR (client_id IS NOT NULL AND can_access_client(auth.uid(), client_id))
    OR (
      NOT has_role(auth.uid(), 'technician'::app_role)
      AND NOT has_role(auth.uid(), 'client'::app_role)
    )
  )
);

CREATE POLICY po_insert_scoped ON public.payment_orders
FOR INSERT TO authenticated
WITH CHECK (
  has_permission(auth.uid(), 'payment_orders', 'create')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR (technician_id IS NOT NULL AND technician_id = get_my_technician_id())
    OR (
      NOT has_role(auth.uid(), 'technician'::app_role)
      AND NOT has_role(auth.uid(), 'client'::app_role)
    )
  )
);

CREATE POLICY po_update_scoped ON public.payment_orders
FOR UPDATE TO authenticated
USING (
  has_permission(auth.uid(), 'payment_orders', 'edit')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR (technician_id IS NOT NULL AND technician_id = get_my_technician_id())
    OR (
      NOT has_role(auth.uid(), 'technician'::app_role)
      AND NOT has_role(auth.uid(), 'client'::app_role)
    )
  )
)
WITH CHECK (
  has_permission(auth.uid(), 'payment_orders', 'edit')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR (technician_id IS NOT NULL AND technician_id = get_my_technician_id())
    OR (
      NOT has_role(auth.uid(), 'technician'::app_role)
      AND NOT has_role(auth.uid(), 'client'::app_role)
    )
  )
);

CREATE POLICY po_delete_scoped ON public.payment_orders
FOR DELETE TO authenticated
USING (
  has_permission(auth.uid(), 'payment_orders', 'delete')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR (technician_id IS NOT NULL AND technician_id = get_my_technician_id())
    OR (
      NOT has_role(auth.uid(), 'technician'::app_role)
      AND NOT has_role(auth.uid(), 'client'::app_role)
    )
  )
);

-- =========================================================
-- financial_records  (THE BUG: previously REQUIRED admin/partner for write,
-- and required tech/client to own the row even with permission override)
-- =========================================================
DROP POLICY IF EXISTS financial_records_select_scoped ON public.financial_records;
DROP POLICY IF EXISTS financial_records_insert_scoped ON public.financial_records;
DROP POLICY IF EXISTS financial_records_update_scoped ON public.financial_records;
DROP POLICY IF EXISTS financial_records_delete_scoped ON public.financial_records;

CREATE POLICY financial_records_select_scoped ON public.financial_records
FOR SELECT TO authenticated
USING (
  has_permission(auth.uid(), 'financial', 'view')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    -- technicians: only their own linked rows, UNLESS they have an explicit override
    OR (
      has_role(auth.uid(), 'technician'::app_role)
      AND (
        (service_order_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.service_orders so
          WHERE so.id = financial_records.service_order_id
            AND so.technician_id = get_my_technician_id()
        ))
        OR (payment_order_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.payment_orders po
          WHERE po.id = financial_records.payment_order_id
            AND po.technician_id = get_my_technician_id()
        ))
      )
    )
    OR (
      has_role(auth.uid(), 'client'::app_role)
      AND (
        (service_order_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.service_orders so
          WHERE so.id = financial_records.service_order_id
            AND so.client_id IS NOT NULL
            AND can_access_client(auth.uid(), so.client_id)
        ))
        OR (payment_order_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.payment_orders po
          WHERE po.id = financial_records.payment_order_id
            AND po.client_id IS NOT NULL
            AND can_access_client(auth.uid(), po.client_id)
        ))
      )
    )
    -- any other authenticated user (custom roles, none) gated purely by permission
    OR (
      NOT has_role(auth.uid(), 'technician'::app_role)
      AND NOT has_role(auth.uid(), 'client'::app_role)
    )
  )
);

CREATE POLICY financial_records_insert_scoped ON public.financial_records
FOR INSERT TO authenticated
WITH CHECK (
  has_permission(auth.uid(), 'financial', 'create')
);

CREATE POLICY financial_records_update_scoped ON public.financial_records
FOR UPDATE TO authenticated
USING ( has_permission(auth.uid(), 'financial', 'edit') )
WITH CHECK ( has_permission(auth.uid(), 'financial', 'edit') );

CREATE POLICY financial_records_delete_scoped ON public.financial_records
FOR DELETE TO authenticated
USING ( has_permission(auth.uid(), 'financial', 'delete') );

-- =========================================================
-- documents
-- =========================================================
DROP POLICY IF EXISTS documents_select_scoped ON public.documents;
DROP POLICY IF EXISTS documents_insert_scoped ON public.documents;
DROP POLICY IF EXISTS documents_update_scoped ON public.documents;
DROP POLICY IF EXISTS documents_delete_scoped ON public.documents;

CREATE POLICY documents_select_scoped ON public.documents
FOR SELECT TO authenticated
USING (
  has_permission(auth.uid(), 'documents', 'view')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR uploaded_by = auth.uid()
    OR (
      has_role(auth.uid(), 'technician'::app_role)
      AND service_order_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.service_orders so
        WHERE so.id = documents.service_order_id
          AND so.technician_id = get_my_technician_id()
      )
    )
    OR (
      has_role(auth.uid(), 'client'::app_role)
      AND service_order_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.service_orders so
        WHERE so.id = documents.service_order_id
          AND so.client_id IS NOT NULL
          AND can_access_client(auth.uid(), so.client_id)
      )
    )
    OR (
      NOT has_role(auth.uid(), 'technician'::app_role)
      AND NOT has_role(auth.uid(), 'client'::app_role)
    )
  )
);

CREATE POLICY documents_insert_scoped ON public.documents
FOR INSERT TO authenticated
WITH CHECK (
  has_permission(auth.uid(), 'documents', 'create')
  AND (uploaded_by = auth.uid() OR uploaded_by IS NULL OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role))
);

CREATE POLICY documents_update_scoped ON public.documents
FOR UPDATE TO authenticated
USING (
  has_permission(auth.uid(), 'documents', 'edit')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR uploaded_by = auth.uid()
    OR (
      NOT has_role(auth.uid(), 'technician'::app_role)
      AND NOT has_role(auth.uid(), 'client'::app_role)
    )
  )
)
WITH CHECK (
  has_permission(auth.uid(), 'documents', 'edit')
);

CREATE POLICY documents_delete_scoped ON public.documents
FOR DELETE TO authenticated
USING (
  has_permission(auth.uid(), 'documents', 'delete')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR uploaded_by = auth.uid()
    OR (
      NOT has_role(auth.uid(), 'technician'::app_role)
      AND NOT has_role(auth.uid(), 'client'::app_role)
    )
  )
);

-- =========================================================
-- clients (used as lookup; gate by any related view permission)
-- =========================================================
DROP POLICY IF EXISTS clients_select_scoped ON public.clients;
DROP POLICY IF EXISTS clients_insert_scoped ON public.clients;
DROP POLICY IF EXISTS clients_update_scoped ON public.clients;
DROP POLICY IF EXISTS clients_delete_scoped ON public.clients;

CREATE POLICY clients_select_scoped ON public.clients
FOR SELECT TO authenticated
USING (
  has_permission(auth.uid(), 'service_orders', 'view')
  OR has_permission(auth.uid(), 'payment_orders', 'view')
  OR has_permission(auth.uid(), 'financial', 'view')
  OR has_permission(auth.uid(), 'documents', 'view')
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR can_access_client(auth.uid(), id)
);

CREATE POLICY clients_insert_scoped ON public.clients
FOR INSERT TO authenticated
WITH CHECK (
  has_permission(auth.uid(), 'service_orders', 'create')
  OR has_permission(auth.uid(), 'payment_orders', 'create')
  OR has_permission(auth.uid(), 'documents', 'create')
);

CREATE POLICY clients_update_scoped ON public.clients
FOR UPDATE TO authenticated
USING (
  has_permission(auth.uid(), 'service_orders', 'edit')
  OR has_permission(auth.uid(), 'payment_orders', 'edit')
  OR has_permission(auth.uid(), 'documents', 'edit')
)
WITH CHECK (
  has_permission(auth.uid(), 'service_orders', 'edit')
  OR has_permission(auth.uid(), 'payment_orders', 'edit')
  OR has_permission(auth.uid(), 'documents', 'edit')
);

CREATE POLICY clients_delete_scoped ON public.clients
FOR DELETE TO authenticated
USING (
  has_permission(auth.uid(), 'service_orders', 'delete')
  OR has_permission(auth.uid(), 'payment_orders', 'delete')
  OR has_permission(auth.uid(), 'documents', 'delete')
);

-- =========================================================
-- technicians (lookup table used across modules)
-- =========================================================
DROP POLICY IF EXISTS tech_select_scoped ON public.technicians;
DROP POLICY IF EXISTS tech_insert_scoped ON public.technicians;
DROP POLICY IF EXISTS tech_update_scoped ON public.technicians;
DROP POLICY IF EXISTS tech_delete_scoped ON public.technicians;

CREATE POLICY tech_select_scoped ON public.technicians
FOR SELECT TO authenticated
USING (
  has_permission(auth.uid(), 'users', 'view')
  OR has_permission(auth.uid(), 'service_orders', 'view')
  OR has_permission(auth.uid(), 'payment_orders', 'view')
  OR has_permission(auth.uid(), 'financial', 'view')
  OR has_permission(auth.uid(), 'fleet', 'view')
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR user_id = auth.uid()
);

CREATE POLICY tech_insert_scoped ON public.technicians
FOR INSERT TO authenticated
WITH CHECK ( has_permission(auth.uid(), 'fleet', 'create') OR has_permission(auth.uid(), 'users', 'create') );

CREATE POLICY tech_update_scoped ON public.technicians
FOR UPDATE TO authenticated
USING ( has_permission(auth.uid(), 'fleet', 'edit') OR has_permission(auth.uid(), 'users', 'edit') OR user_id = auth.uid() )
WITH CHECK ( has_permission(auth.uid(), 'fleet', 'edit') OR has_permission(auth.uid(), 'users', 'edit') OR user_id = auth.uid() );

CREATE POLICY tech_delete_scoped ON public.technicians
FOR DELETE TO authenticated
USING ( has_permission(auth.uid(), 'fleet', 'delete') OR has_permission(auth.uid(), 'users', 'delete') );