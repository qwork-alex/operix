-- STEP 1: Create independent sequences per role
CREATE SEQUENCE IF NOT EXISTS public.technician_display_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.partner_display_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.client_display_seq START 1;

-- STEP 2: Add display_code columns
ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS display_code TEXT UNIQUE;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS display_code TEXT UNIQUE;

-- Partners are users with role='partner' in user_roles. Store on profiles for display.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_code TEXT UNIQUE;

-- STEP 3: Trigger functions to auto-assign display_code

-- Technicians
CREATE OR REPLACE FUNCTION public.set_technician_display_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.display_code IS NULL OR NEW.display_code = '' THEN
    NEW.display_code := 'T' || lpad(nextval('public.technician_display_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_technician_display_code ON public.technicians;
CREATE TRIGGER trg_set_technician_display_code
BEFORE INSERT ON public.technicians
FOR EACH ROW
EXECUTE FUNCTION public.set_technician_display_code();

-- Clients
CREATE OR REPLACE FUNCTION public.set_client_display_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.display_code IS NULL OR NEW.display_code = '' THEN
    NEW.display_code := 'C' || lpad(nextval('public.client_display_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_client_display_code ON public.clients;
CREATE TRIGGER trg_set_client_display_code
BEFORE INSERT ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.set_client_display_code();

-- Partners (assign on profile when role becomes 'partner')
CREATE OR REPLACE FUNCTION public.set_partner_display_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing TEXT;
BEGIN
  IF NEW.role = 'partner'::public.app_role THEN
    SELECT display_code INTO v_existing FROM public.profiles WHERE id = NEW.user_id;
    IF v_existing IS NULL OR v_existing = '' THEN
      UPDATE public.profiles
      SET display_code = 'S' || lpad(nextval('public.partner_display_seq')::text, 5, '0')
      WHERE id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_partner_display_code ON public.user_roles;
CREATE TRIGGER trg_set_partner_display_code
AFTER INSERT OR UPDATE OF role ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.set_partner_display_code();

-- STEP 4: Backfill existing rows (ordered by created_at for stable codes)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.technicians WHERE display_code IS NULL ORDER BY created_at ASC LOOP
    UPDATE public.technicians
    SET display_code = 'T' || lpad(nextval('public.technician_display_seq')::text, 5, '0')
    WHERE id = r.id;
  END LOOP;

  FOR r IN SELECT id FROM public.clients WHERE display_code IS NULL ORDER BY created_at ASC LOOP
    UPDATE public.clients
    SET display_code = 'C' || lpad(nextval('public.client_display_seq')::text, 5, '0')
    WHERE id = r.id;
  END LOOP;

  FOR r IN
    SELECT DISTINCT p.id, p.created_at
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE ur.role = 'partner'::public.app_role
      AND (p.display_code IS NULL OR p.display_code = '')
    ORDER BY p.created_at ASC
  LOOP
    UPDATE public.profiles
    SET display_code = 'S' || lpad(nextval('public.partner_display_seq')::text, 5, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

-- STEP 5: Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_technicians_display_code ON public.technicians(display_code);
CREATE INDEX IF NOT EXISTS idx_clients_display_code ON public.clients(display_code);
CREATE INDEX IF NOT EXISTS idx_profiles_display_code ON public.profiles(display_code);