-- STEP 1: Add technician_id column
ALTER TABLE public.financial_records
ADD COLUMN IF NOT EXISTS technician_id uuid REFERENCES public.technicians(id);

-- STEP 2: Backfill from service_orders
UPDATE public.financial_records fr
SET technician_id = so.technician_id
FROM public.service_orders so
WHERE fr.service_order_id = so.id
  AND fr.technician_id IS NULL
  AND so.technician_id IS NOT NULL;

-- Backfill from payment_orders
UPDATE public.financial_records fr
SET technician_id = po.technician_id
FROM public.payment_orders po
WHERE fr.payment_order_id = po.id
  AND fr.technician_id IS NULL
  AND po.technician_id IS NOT NULL;

-- Backfill from created_by → matching technician.user_id
UPDATE public.financial_records fr
SET technician_id = t.id
FROM public.technicians t
WHERE fr.technician_id IS NULL
  AND fr.created_by IS NOT NULL
  AND t.user_id = fr.created_by;

-- STEP 3: Handle remaining NULLs → assign to first technician, or delete if none
DO $$
DECLARE
  v_fallback_tech uuid;
BEGIN
  SELECT id INTO v_fallback_tech FROM public.technicians ORDER BY created_at ASC LIMIT 1;

  IF v_fallback_tech IS NOT NULL THEN
    UPDATE public.financial_records
    SET technician_id = v_fallback_tech
    WHERE technician_id IS NULL;
  ELSE
    DELETE FROM public.financial_records WHERE technician_id IS NULL;
  END IF;
END $$;

-- STEP 4: Make technician_id required
ALTER TABLE public.financial_records
ALTER COLUMN technician_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_records_technician_id
  ON public.financial_records(technician_id);

-- STEP 5: Replace RLS policies — use technician_id (not created_by)
DROP POLICY IF EXISTS financial_records_select_scoped ON public.financial_records;
DROP POLICY IF EXISTS financial_records_insert_scoped ON public.financial_records;
DROP POLICY IF EXISTS financial_records_update_scoped ON public.financial_records;
DROP POLICY IF EXISTS financial_records_delete_scoped ON public.financial_records;

CREATE POLICY financial_records_select_tech
ON public.financial_records
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR technician_id = get_my_technician_id()
);

CREATE POLICY financial_records_insert_tech
ON public.financial_records
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR technician_id = get_my_technician_id()
);

CREATE POLICY financial_records_update_tech
ON public.financial_records
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR technician_id = get_my_technician_id()
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR technician_id = get_my_technician_id()
);

CREATE POLICY financial_records_delete_admin
ON public.financial_records
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- STEP 6: Trigger — auto-fill technician_id for technicians, validate admin provided one
CREATE OR REPLACE FUNCTION public.set_financial_record_technician()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.technician_id := get_my_technician_id();
  END IF;

  IF NEW.technician_id IS NULL THEN
    RAISE EXCEPTION 'technician_id is required on financial_records. Admin users must select a technician.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_financial_record_technician ON public.financial_records;

CREATE TRIGGER trg_set_financial_record_technician
BEFORE INSERT ON public.financial_records
FOR EACH ROW
EXECUTE FUNCTION public.set_financial_record_technician();