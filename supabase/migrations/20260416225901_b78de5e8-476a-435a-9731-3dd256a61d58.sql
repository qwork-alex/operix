-- 1. Add immutable snapshot column to service_orders
ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS distribution_snapshot jsonb;

-- 2. Backfill snapshot from existing service_order_distributions
-- Only fills rows where snapshot is still NULL (one-time freeze of current state)
UPDATE public.service_orders so
SET distribution_snapshot = sub.snap
FROM (
  SELECT
    service_order_id,
    jsonb_agg(
      jsonb_build_object(
        'participant_name', participant_name,
        'percentage', percentage,
        'calculated_value', calculated_value,
        'rule_item_id', rule_item_id
      )
    ) AS snap
  FROM public.service_order_distributions
  GROUP BY service_order_id
) sub
WHERE so.id = sub.service_order_id
  AND so.distribution_snapshot IS NULL;

-- 3. Trigger: when a NEW distribution is inserted for an OS that has no snapshot,
-- materialize the snapshot once. Editing rules later does NOT touch existing snapshots.
CREATE OR REPLACE FUNCTION public.freeze_distribution_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing jsonb;
  v_snap jsonb;
BEGIN
  SELECT distribution_snapshot INTO v_existing
  FROM public.service_orders
  WHERE id = NEW.service_order_id;

  -- If snapshot already exists, never overwrite it (immutable)
  IF v_existing IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Build snapshot from all current distributions of this OS (including the new row)
  SELECT jsonb_agg(
    jsonb_build_object(
      'participant_name', participant_name,
      'percentage', percentage,
      'calculated_value', calculated_value,
      'rule_item_id', rule_item_id
    )
  )
  INTO v_snap
  FROM public.service_order_distributions
  WHERE service_order_id = NEW.service_order_id;

  IF v_snap IS NOT NULL THEN
    UPDATE public.service_orders
    SET distribution_snapshot = v_snap
    WHERE id = NEW.service_order_id
      AND distribution_snapshot IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_distribution_snapshot ON public.service_order_distributions;
CREATE TRIGGER trg_freeze_distribution_snapshot
AFTER INSERT ON public.service_order_distributions
FOR EACH ROW
EXECUTE FUNCTION public.freeze_distribution_snapshot();