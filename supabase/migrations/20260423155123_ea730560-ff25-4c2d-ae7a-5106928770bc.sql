-- 1. Ensure columns exist
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS technician_id uuid;

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- 2. Backfill technician_id by resolving created_by -> technicians.id
--    (technician_id has FK to technicians.id, so we cannot use auth user ids directly)
UPDATE public.service_orders so
SET technician_id = t.id
FROM public.technicians t
WHERE so.technician_id IS NULL
  AND so.created_by IS NOT NULL
  AND t.user_id = so.created_by;

-- 3. Set NOT NULL only if all rows have a value
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM public.service_orders WHERE technician_id IS NULL;

  IF v_remaining = 0 THEN
    ALTER TABLE public.service_orders
      ALTER COLUMN technician_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'Skipping NOT NULL on technician_id: % rows still have NULL (no matching technicians.user_id for their created_by)', v_remaining;
  END IF;
END $$;

-- 4. Ensure RLS is enabled
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;