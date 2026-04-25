ALTER TABLE public.profit_rules
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid;

UPDATE public.profit_rules pr
SET assigned_user_id = t.user_id
FROM public.technicians t
WHERE pr.technician_id = t.id
  AND pr.assigned_user_id IS NULL
  AND t.user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profit_rules_assigned_user_id
  ON public.profit_rules(assigned_user_id);