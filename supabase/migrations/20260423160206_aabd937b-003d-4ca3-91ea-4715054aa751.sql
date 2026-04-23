-- FINAL FIX: PROFESSIONAL RLS MODEL

DROP POLICY IF EXISTS select_own_or_admin ON service_orders;
DROP POLICY IF EXISTS insert_own_or_admin ON service_orders;
DROP POLICY IF EXISTS update_own_or_admin ON service_orders;
DROP POLICY IF EXISTS delete_admin_only ON service_orders;

-- SELECT
CREATE POLICY "secure_select"
ON service_orders
FOR SELECT
USING (
  has_role(auth.uid(), 'admin')
  OR technician_id = get_my_technician_id()
);

-- INSERT
CREATE POLICY "secure_insert"
ON service_orders
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR technician_id = get_my_technician_id()
);

-- UPDATE
CREATE POLICY "secure_update"
ON service_orders
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin')
  OR technician_id = get_my_technician_id()
);

-- DELETE
CREATE POLICY "secure_delete"
ON service_orders
FOR DELETE
USING (
  has_role(auth.uid(), 'admin')
);