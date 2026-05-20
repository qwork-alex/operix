
-- Phase 1: Financial relationship engine — origin tracking, fleet linkage, driver↔user linking

-- 1. financial_records: add origin + vehicle_id (entry origin system)
ALTER TABLE public.financial_records
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS vehicle_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financial_records_origin_check'
  ) THEN
    ALTER TABLE public.financial_records
      ADD CONSTRAINT financial_records_origin_check
      CHECK (origin IN ('manual','fleet','operational','imported'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_financial_records_origin ON public.financial_records(origin);
CREATE INDEX IF NOT EXISTS idx_financial_records_vehicle_id ON public.financial_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_assigned_user_year
  ON public.financial_records(assigned_user_id, year_reference);

-- 2. drivers: add optional link to a workspace auth user
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS linked_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_drivers_linked_user_id ON public.drivers(linked_user_id);
