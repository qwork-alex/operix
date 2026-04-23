
-- =========================================================================
-- Helper: resolve permission for a user (returns allowed + scope)
-- Resolution order (mirrors frontend useCan):
--   1. Admin -> { true, 'all' }
--   2. user_permissions override (allow + scope)
--   3. role_permissions for user's role (allow=true + scope)
--   4. Default deny -> { false, null }
-- NULL scope is treated as 'all' for backward compatibility.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.check_permission(
  _user_id uuid,
  _module text,
  _action text
)
RETURNS TABLE(allowed boolean, scope public.permission_scope)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perm_id uuid;
  v_user_role public.app_role;
  v_override_allow boolean;
  v_override_scope public.permission_scope;
  v_role_scope public.permission_scope;
BEGIN
  -- Admin shortcut
  IF public.has_role(_user_id, 'admin') THEN
    RETURN QUERY SELECT true, 'all'::public.permission_scope;
    RETURN;
  END IF;

  SELECT id INTO v_perm_id
  FROM public.permissions
  WHERE module = _module AND action = _action
  LIMIT 1;

  IF v_perm_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::public.permission_scope;
    RETURN;
  END IF;

  -- 1) user override
  SELECT up.allow, up.scope
  INTO v_override_allow, v_override_scope
  FROM public.user_permissions up
  WHERE up.user_id = _user_id AND up.permission_id = v_perm_id
  LIMIT 1;

  IF v_override_allow IS NOT NULL THEN
    IF v_override_allow THEN
      RETURN QUERY SELECT true, COALESCE(v_override_scope, 'all'::public.permission_scope);
    ELSE
      RETURN QUERY SELECT false, NULL::public.permission_scope;
    END IF;
    RETURN;
  END IF;

  -- 2) role permission
  SELECT role INTO v_user_role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RETURN QUERY SELECT false, NULL::public.permission_scope;
    RETURN;
  END IF;

  SELECT rp.scope INTO v_role_scope
  FROM public.role_permissions rp
  WHERE rp.role = v_user_role AND rp.permission_id = v_perm_id
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT true, COALESCE(v_role_scope, 'all'::public.permission_scope);
    RETURN;
  END IF;

  RETURN QUERY SELECT false, NULL::public.permission_scope;
END;
$$;

-- =========================================================================
-- Boolean wrapper for "can do action at all" (scope-agnostic gate)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.can_do(
  _user_id uuid,
  _module text,
  _action text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT allowed FROM public.check_permission(_user_id, _module, _action)), false);
$$;

-- =========================================================================
-- Row visibility helper: applies scope to a candidate row
-- Used in RLS USING/WITH CHECK clauses.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.row_in_scope(
  _user_id uuid,
  _module text,
  _action text,
  _row_created_by uuid,
  _row_group_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_scope public.permission_scope;
BEGIN
  SELECT allowed, scope INTO v_allowed, v_scope
  FROM public.check_permission(_user_id, _module, _action);

  IF NOT COALESCE(v_allowed, false) THEN
    RETURN false;
  END IF;

  -- NULL scope -> treat as 'all' (backward compatibility)
  IF v_scope IS NULL OR v_scope = 'all' THEN
    RETURN true;
  END IF;

  IF v_scope = 'own' THEN
    RETURN _row_created_by IS NOT DISTINCT FROM _user_id;
  END IF;

  IF v_scope = 'team' THEN
    -- Team = shares a group_id with any row the user created in same module table.
    -- For simplicity we accept the row if its group_id appears in any record
    -- created by this user across service_orders or payment_orders.
    IF _row_group_id IS NULL THEN
      RETURN _row_created_by IS NOT DISTINCT FROM _user_id;
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.created_by = _user_id AND so.group_id = _row_group_id
      UNION ALL
      SELECT 1 FROM public.payment_orders po
      WHERE po.created_by = _user_id AND po.group_id = _row_group_id
    );
  END IF;

  RETURN false;
END;
$$;

-- =========================================================================
-- service_orders policies
-- =========================================================================
DROP POLICY IF EXISTS service_orders_select_scoped ON public.service_orders;
DROP POLICY IF EXISTS service_orders_insert_scoped ON public.service_orders;
DROP POLICY IF EXISTS service_orders_update_scoped ON public.service_orders;
DROP POLICY IF EXISTS service_orders_delete_scoped ON public.service_orders;

CREATE POLICY service_orders_select_scoped ON public.service_orders
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'service_orders', 'view', created_by, group_id)
  OR (technician_id IS NOT NULL AND technician_id = public.get_my_technician_id())
  OR (client_id IS NOT NULL AND public.can_access_client(auth.uid(), client_id))
);

CREATE POLICY service_orders_insert_scoped ON public.service_orders
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.can_do(auth.uid(), 'service_orders', 'create')
);

CREATE POLICY service_orders_update_scoped ON public.service_orders
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'service_orders', 'edit', created_by, group_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'service_orders', 'edit', created_by, group_id)
);

CREATE POLICY service_orders_delete_scoped ON public.service_orders
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'service_orders', 'delete', created_by, group_id)
);

-- =========================================================================
-- payment_orders policies
-- =========================================================================
DROP POLICY IF EXISTS po_select_scoped ON public.payment_orders;
DROP POLICY IF EXISTS po_insert_scoped ON public.payment_orders;
DROP POLICY IF EXISTS po_update_scoped ON public.payment_orders;
DROP POLICY IF EXISTS po_delete_scoped ON public.payment_orders;

CREATE POLICY po_select_scoped ON public.payment_orders
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'payment_orders', 'view', created_by, group_id)
  OR (technician_id IS NOT NULL AND technician_id = public.get_my_technician_id())
  OR (client_id IS NOT NULL AND public.can_access_client(auth.uid(), client_id))
);

CREATE POLICY po_insert_scoped ON public.payment_orders
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.can_do(auth.uid(), 'payment_orders', 'create')
);

CREATE POLICY po_update_scoped ON public.payment_orders
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'payment_orders', 'edit', created_by, group_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'payment_orders', 'edit', created_by, group_id)
);

CREATE POLICY po_delete_scoped ON public.payment_orders
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'payment_orders', 'delete', created_by, group_id)
);

-- =========================================================================
-- financial_records policies (no group_id column -> pass NULL)
-- =========================================================================
DROP POLICY IF EXISTS financial_records_select_scoped ON public.financial_records;
DROP POLICY IF EXISTS financial_records_insert_scoped ON public.financial_records;
DROP POLICY IF EXISTS financial_records_update_scoped ON public.financial_records;
DROP POLICY IF EXISTS financial_records_delete_scoped ON public.financial_records;

CREATE POLICY financial_records_select_scoped ON public.financial_records
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'financial', 'view', created_by, NULL)
);

CREATE POLICY financial_records_insert_scoped ON public.financial_records
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.can_do(auth.uid(), 'financial', 'create')
);

CREATE POLICY financial_records_update_scoped ON public.financial_records
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'financial', 'edit', created_by, NULL)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'financial', 'edit', created_by, NULL)
);

CREATE POLICY financial_records_delete_scoped ON public.financial_records
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'financial', 'delete', created_by, NULL)
);

-- =========================================================================
-- documents policies (owner col = uploaded_by, no group_id)
-- =========================================================================
DROP POLICY IF EXISTS documents_select_scoped ON public.documents;
DROP POLICY IF EXISTS documents_insert_scoped ON public.documents;
DROP POLICY IF EXISTS documents_update_scoped ON public.documents;
DROP POLICY IF EXISTS documents_delete_scoped ON public.documents;

CREATE POLICY documents_select_scoped ON public.documents
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'documents', 'view', uploaded_by, NULL)
);

CREATE POLICY documents_insert_scoped ON public.documents
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.can_do(auth.uid(), 'documents', 'create')
);

CREATE POLICY documents_update_scoped ON public.documents
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'documents', 'edit', uploaded_by, NULL)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'documents', 'edit', uploaded_by, NULL)
);

CREATE POLICY documents_delete_scoped ON public.documents
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.row_in_scope(auth.uid(), 'documents', 'delete', uploaded_by, NULL)
);

-- =========================================================================
-- clients policies (no created_by/group meaningful for scope; gate by perm)
-- =========================================================================
DROP POLICY IF EXISTS clients_select_scoped ON public.clients;
DROP POLICY IF EXISTS clients_insert_scoped ON public.clients;
DROP POLICY IF EXISTS clients_update_scoped ON public.clients;
DROP POLICY IF EXISTS clients_delete_scoped ON public.clients;

CREATE POLICY clients_select_scoped ON public.clients
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'partner')
  OR public.can_do(auth.uid(), 'service_orders', 'view')
  OR public.can_do(auth.uid(), 'payment_orders', 'view')
  OR public.can_do(auth.uid(), 'financial', 'view')
  OR public.can_do(auth.uid(), 'documents', 'view')
  OR public.can_access_client(auth.uid(), id)
);

CREATE POLICY clients_insert_scoped ON public.clients
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.can_do(auth.uid(), 'service_orders', 'create')
  OR public.can_do(auth.uid(), 'payment_orders', 'create')
  OR public.can_do(auth.uid(), 'documents', 'create')
);

CREATE POLICY clients_update_scoped ON public.clients
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.can_do(auth.uid(), 'service_orders', 'edit')
  OR public.can_do(auth.uid(), 'payment_orders', 'edit')
  OR public.can_do(auth.uid(), 'documents', 'edit')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.can_do(auth.uid(), 'service_orders', 'edit')
  OR public.can_do(auth.uid(), 'payment_orders', 'edit')
  OR public.can_do(auth.uid(), 'documents', 'edit')
);

CREATE POLICY clients_delete_scoped ON public.clients
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.can_do(auth.uid(), 'service_orders', 'delete')
  OR public.can_do(auth.uid(), 'payment_orders', 'delete')
  OR public.can_do(auth.uid(), 'documents', 'delete')
);
