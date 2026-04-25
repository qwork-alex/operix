-- Step 1: add nullable assigned_user_id
ALTER TABLE public.financial_records
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid;

-- Step 2: backfill from technicians.user_id
UPDATE public.financial_records fr
SET assigned_user_id = t.user_id
FROM public.technicians t
WHERE fr.technician_id = t.id
  AND fr.assigned_user_id IS NULL
  AND t.user_id IS NOT NULL;

-- Helpful index for upcoming RLS / queries
CREATE INDEX IF NOT EXISTS idx_financial_records_assigned_user_id
  ON public.financial_records(assigned_user_id);