
-- =====================================================================
-- Phase B3.3 — DELETE ACL alignment + silent-failure fix
-- =====================================================================
-- Replaces admin-only DELETE policies on service_orders, payment_orders,
-- and financial_records with permission-driven policies that respect
-- row_in_scope() (own/team/all) granted by the admin via ACL.
-- Admin remains a hard short-circuit. Owner of the row is always allowed
-- (consistent with INSERT/UPDATE rbac).
-- =====================================================================

-- service_orders.DELETE
DROP POLICY IF EXISTS so_delete_admin ON public.service_orders;
CREATE POLICY so_delete_rbac
  ON public.service_orders
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.row_in_scope(auth.uid(), 'service_orders', 'delete', created_by, group_id)
    OR (user_id = auth.uid() AND public.can_do(auth.uid(), 'service_orders', 'delete'))
  );

-- payment_orders.DELETE
DROP POLICY IF EXISTS po_delete_admin ON public.payment_orders;
CREATE POLICY po_delete_rbac
  ON public.payment_orders
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.row_in_scope(auth.uid(), 'payment_orders', 'delete', created_by, group_id)
    OR (user_id = auth.uid() AND public.can_do(auth.uid(), 'payment_orders', 'delete'))
  );

-- financial_records.DELETE
DROP POLICY IF EXISTS financial_records_delete_admin_only ON public.financial_records;
CREATE POLICY financial_records_delete_rbac
  ON public.financial_records
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.can_do(auth.uid(), 'financial', 'delete')
      AND (user_id = auth.uid() OR created_by = auth.uid() OR assigned_user_id = auth.uid())
    )
  );

-- Audit
INSERT INTO public.rls_validation_logs (phase, check_name, sample)
VALUES (
  'B3.3',
  'delete_acl_alignment',
  jsonb_build_object(
    'replaced', jsonb_build_array('so_delete_admin','po_delete_admin','financial_records_delete_admin_only'),
    'created',  jsonb_build_array('so_delete_rbac','po_delete_rbac','financial_records_delete_rbac'),
    'rule', 'admin OR row_in_scope(delete) OR (owner AND can_do(delete))'
  )
);
