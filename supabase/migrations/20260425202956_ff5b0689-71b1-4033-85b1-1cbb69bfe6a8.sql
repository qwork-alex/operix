-- Add assigned_user_id to payment_orders to mirror service_orders
ALTER TABLE public.payment_orders
ADD COLUMN IF NOT EXISTS assigned_user_id uuid;

-- Backfill from technicians.user_id when technician_id is set
UPDATE public.payment_orders po
SET assigned_user_id = t.user_id
FROM public.technicians t
WHERE po.technician_id = t.id
  AND po.assigned_user_id IS NULL;

-- Fallback backfill: use created_by when no technician link
UPDATE public.payment_orders
SET assigned_user_id = created_by
WHERE assigned_user_id IS NULL
  AND created_by IS NOT NULL;