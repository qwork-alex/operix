-- Drop old policies
DROP POLICY IF EXISTS financial_records_select_tech ON public.financial_records;
DROP POLICY IF EXISTS financial_records_insert_tech ON public.financial_records;
DROP POLICY IF EXISTS financial_records_update_tech ON public.financial_records;

-- Recreate using assigned_user_id
CREATE POLICY financial_records_select_assigned
ON public.financial_records
FOR SELECT
TO authenticated
USING (
  has_global_view(auth.uid())
  OR assigned_user_id = auth.uid()
);

CREATE POLICY financial_records_insert_assigned
ON public.financial_records
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR assigned_user_id = auth.uid()
);

CREATE POLICY financial_records_update_assigned
ON public.financial_records
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR assigned_user_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR assigned_user_id = auth.uid()
);

-- Drop legacy trigger that forces technician_id on insert
DROP TRIGGER IF EXISTS set_financial_record_technician_trg ON public.financial_records;
DROP TRIGGER IF EXISTS set_financial_record_technician ON public.financial_records;