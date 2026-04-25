-- Enforce consistency: technician_id (legacy) must align with assigned_user_id via technicians.user_id.
-- If it does not match, silently null it out so no logic can depend on a stale value.

CREATE OR REPLACE FUNCTION public.enforce_technician_id_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tech_user_id uuid;
BEGIN
  IF NEW.technician_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_tech_user_id
  FROM public.technicians
  WHERE id = NEW.technician_id
  LIMIT 1;

  -- If technician_id does not resolve to the same user as assigned_user_id, drop it.
  IF v_tech_user_id IS NULL
     OR NEW.assigned_user_id IS NULL
     OR v_tech_user_id <> NEW.assigned_user_id THEN
    NEW.technician_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_orders_enforce_tech_consistency ON public.service_orders;
CREATE TRIGGER service_orders_enforce_tech_consistency
BEFORE INSERT OR UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_technician_id_consistency();

DROP TRIGGER IF EXISTS payment_orders_enforce_tech_consistency ON public.payment_orders;
CREATE TRIGGER payment_orders_enforce_tech_consistency
BEFORE INSERT OR UPDATE ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_technician_id_consistency();

-- Backfill: clean up existing rows where technician_id is inconsistent with assigned_user_id.
UPDATE public.service_orders so
SET technician_id = NULL
WHERE so.technician_id IS NOT NULL
  AND (
    so.assigned_user_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.technicians t
      WHERE t.id = so.technician_id AND t.user_id = so.assigned_user_id
    )
  );

UPDATE public.payment_orders po
SET technician_id = NULL
WHERE po.technician_id IS NOT NULL
  AND (
    po.assigned_user_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.technicians t
      WHERE t.id = po.technician_id AND t.user_id = po.assigned_user_id
    )
  );