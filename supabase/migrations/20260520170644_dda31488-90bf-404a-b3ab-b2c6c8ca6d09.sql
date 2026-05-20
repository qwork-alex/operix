
-- Phase 2: Automatic Financial Engine
-- 1) Dedup guard: one automatic financial_record per (workspace, origin, source ref)
CREATE UNIQUE INDEX IF NOT EXISTS financial_records_origin_ref_unique
  ON public.financial_records (workspace_id, origin, reference_id)
  WHERE reference_id IS NOT NULL AND origin <> 'manual';

-- 2) Sync function: mirror fleet_fuel_logs into financial_records
CREATE OR REPLACE FUNCTION public.sync_financial_record_from_fuel_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label TEXT;
  v_plate TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.financial_records
     WHERE origin = 'fleet'
       AND reference_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT license_plate INTO v_plate FROM public.vehicles WHERE id = NEW.vehicle_id;
  v_label := 'Combustível' || COALESCE(' — ' || v_plate, '');

  INSERT INTO public.financial_records (
    workspace_id,
    type,
    source,
    origin,
    category,
    amount,
    label,
    notes,
    status,
    year_reference,
    created_at,
    created_by,
    reference_id,
    vehicle_id,
    assigned_user_id
  ) VALUES (
    NEW.workspace_id,
    'expense',
    'fleet',
    'fleet',
    'fuel',
    COALESCE(NEW.total_cost, 0),
    v_label,
    CONCAT_WS(' • ',
      NULLIF(NEW.liters::text || 'L', 'L'),
      CASE WHEN NEW.km_at_fuel IS NOT NULL THEN NEW.km_at_fuel::text || ' km' END,
      NEW.notes
    ),
    'confirmed',
    EXTRACT(YEAR FROM NEW.date)::int,
    COALESCE(NEW.date::timestamptz, NEW.created_at, now()),
    NEW.created_by,
    NEW.id,
    NEW.vehicle_id,
    (SELECT linked_user_id FROM public.drivers WHERE id = NEW.driver_id)
  )
  ON CONFLICT (workspace_id, origin, reference_id)
  WHERE reference_id IS NOT NULL AND origin <> 'manual'
  DO UPDATE SET
    amount          = EXCLUDED.amount,
    label           = EXCLUDED.label,
    notes           = EXCLUDED.notes,
    year_reference  = EXCLUDED.year_reference,
    created_at      = EXCLUDED.created_at,
    vehicle_id      = EXCLUDED.vehicle_id,
    assigned_user_id= EXCLUDED.assigned_user_id;

  RETURN NEW;
END;
$$;

-- 3) Triggers
DROP TRIGGER IF EXISTS trg_sync_fr_from_fuel_iud ON public.fleet_fuel_logs;
CREATE TRIGGER trg_sync_fr_from_fuel_iud
AFTER INSERT OR UPDATE OR DELETE ON public.fleet_fuel_logs
FOR EACH ROW EXECUTE FUNCTION public.sync_financial_record_from_fuel_log();

-- 4) Backfill existing fuel logs into financial_records (idempotent via unique index)
INSERT INTO public.financial_records (
  workspace_id, type, source, origin, category, amount, label, notes, status,
  year_reference, created_at, created_by, reference_id, vehicle_id, assigned_user_id
)
SELECT
  f.workspace_id,
  'expense', 'fleet', 'fleet', 'fuel',
  COALESCE(f.total_cost, 0),
  'Combustível' || COALESCE(' — ' || v.license_plate, ''),
  CONCAT_WS(' • ',
    NULLIF(f.liters::text || 'L', 'L'),
    CASE WHEN f.km_at_fuel IS NOT NULL THEN f.km_at_fuel::text || ' km' END,
    f.notes
  ),
  'confirmed',
  EXTRACT(YEAR FROM f.date)::int,
  COALESCE(f.date::timestamptz, f.created_at, now()),
  f.created_by,
  f.id,
  f.vehicle_id,
  (SELECT linked_user_id FROM public.drivers WHERE id = f.driver_id)
FROM public.fleet_fuel_logs f
LEFT JOIN public.vehicles v ON v.id = f.vehicle_id
ON CONFLICT (workspace_id, origin, reference_id)
WHERE reference_id IS NOT NULL AND origin <> 'manual'
DO NOTHING;
