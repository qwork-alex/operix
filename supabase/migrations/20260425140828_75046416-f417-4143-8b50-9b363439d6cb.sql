
-- 1. Add new universal column
ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS assigned_user_id uuid;

-- 2. Backfill from existing technician link
UPDATE public.service_orders so
SET assigned_user_id = t.user_id
FROM public.technicians t
WHERE so.technician_id = t.id
  AND so.assigned_user_id IS NULL;

-- 3. Enforce NOT NULL
ALTER TABLE public.service_orders
ALTER COLUMN assigned_user_id SET NOT NULL;
