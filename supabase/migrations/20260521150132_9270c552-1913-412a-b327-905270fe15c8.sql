ALTER TABLE public.billing_profiles
  ADD COLUMN IF NOT EXISTS vat_mode text NOT NULL DEFAULT 'with_vat';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_profiles_vat_mode_check'
  ) THEN
    ALTER TABLE public.billing_profiles
      ADD CONSTRAINT billing_profiles_vat_mode_check
      CHECK (vat_mode IN ('with_vat','no_vat','reverse_charge'));
  END IF;
END $$;