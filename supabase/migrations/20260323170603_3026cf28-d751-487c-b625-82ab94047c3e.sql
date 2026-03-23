-- 1) Schema alignment for ownership + relationships
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS created_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clients_created_by_fkey'
      AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.financial_records
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS service_order_id uuid,
  ADD COLUMN IF NOT EXISTS payment_order_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_records_created_by_fkey'
      AND conrelid = 'public.financial_records'::regclass
  ) THEN
    ALTER TABLE public.financial_records
      ADD CONSTRAINT financial_records_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_records_service_order_id_fkey'
      AND conrelid = 'public.financial_records'::regclass
  ) THEN
    ALTER TABLE public.financial_records
      ADD CONSTRAINT financial_records_service_order_id_fkey
      FOREIGN KEY (service_order_id) REFERENCES public.service_orders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_records_payment_order_id_fkey'
      AND conrelid = 'public.financial_records'::regclass
  ) THEN
    ALTER TABLE public.financial_records
      ADD CONSTRAINT financial_records_payment_order_id_fkey
      FOREIGN KEY (payment_order_id) REFERENCES public.payment_orders(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS created_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vehicles_created_by_fkey'
      AND conrelid = 'public.vehicles'::regclass
  ) THEN
    ALTER TABLE public.vehicles
      ADD CONSTRAINT vehicles_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS service_order_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_orders_service_order_id_fkey'
      AND conrelid = 'public.payment_orders'::regclass
  ) THEN
    ALTER TABLE public.payment_orders
      ADD CONSTRAINT payment_orders_service_order_id_fkey
      FOREIGN KEY (service_order_id) REFERENCES public.service_orders(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS entity_type text;

-- Ownership defaults to reduce insert failures
ALTER TABLE public.service_orders ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.payment_orders ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.documents ALTER COLUMN uploaded_by SET DEFAULT auth.uid();
ALTER TABLE public.clients ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.financial_records ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.vehicles ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.technicians ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 2) Trigger helpers for ownership autofill
CREATE OR REPLACE FUNCTION public.set_created_by_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NEW.created_by IS NULL AND v_uid IS NOT NULL THEN
    NEW.created_by := v_uid;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_uploaded_by_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NEW.uploaded_by IS NULL AND v_uid IS NOT NULL THEN
    NEW.uploaded_by := v_uid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_created_by_service_orders ON public.service_orders;
CREATE TRIGGER trg_set_created_by_service_orders
BEFORE INSERT ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();

DROP TRIGGER IF EXISTS trg_set_created_by_payment_orders ON public.payment_orders;
CREATE TRIGGER trg_set_created_by_payment_orders
BEFORE INSERT ON public.payment_orders
FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();

DROP TRIGGER IF EXISTS trg_set_created_by_clients ON public.clients;
CREATE TRIGGER trg_set_created_by_clients
BEFORE INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();

DROP TRIGGER IF EXISTS trg_set_created_by_financial_records ON public.financial_records;
CREATE TRIGGER trg_set_created_by_financial_records
BEFORE INSERT ON public.financial_records
FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();

DROP TRIGGER IF EXISTS trg_set_created_by_vehicles ON public.vehicles;
CREATE TRIGGER trg_set_created_by_vehicles
BEFORE INSERT ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();

DROP TRIGGER IF EXISTS trg_set_uploaded_by_documents ON public.documents;
CREATE TRIGGER trg_set_uploaded_by_documents
BEFORE INSERT ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.set_uploaded_by_from_auth();

-- 3) Backend debug log table + trigger function
CREATE TABLE IF NOT EXISTS public.backend_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  action text NOT NULL,
  row_id uuid NULL,
  actor_user_id uuid NULL,
  payload jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.backend_event_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname='public' AND tablename='backend_event_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.backend_event_logs', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Admin read backend logs"
ON public.backend_event_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System write backend logs"
ON public.backend_event_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.log_backend_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.backend_event_logs(table_name, action, row_id, actor_user_id, payload)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    auth.uid(),
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE to_jsonb(OLD) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_service_orders ON public.service_orders;
CREATE TRIGGER trg_log_service_orders
AFTER INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.log_backend_event();

DROP TRIGGER IF EXISTS trg_log_payment_orders ON public.payment_orders;
CREATE TRIGGER trg_log_payment_orders
AFTER INSERT OR UPDATE ON public.payment_orders
FOR EACH ROW EXECUTE FUNCTION public.log_backend_event();

DROP TRIGGER IF EXISTS trg_log_financial_records ON public.financial_records;
CREATE TRIGGER trg_log_financial_records
AFTER INSERT OR UPDATE ON public.financial_records
FOR EACH ROW EXECUTE FUNCTION public.log_backend_event();

-- 4) Drop ALL existing policies on requested tables (+ profiles to cover app "users" entity)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY[
        'technicians','clients','service_orders','payment_orders','financial_records','vehicles','documents','profiles'
      ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 5) Clean non-recursive RLS policies
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
CREATE POLICY "technicians_select_owner_or_admin"
ON public.technicians
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "technicians_insert_owner_or_admin"
ON public.technicians
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "technicians_update_owner_or_admin"
ON public.technicians
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "technicians_delete_owner_or_admin"
ON public.technicians
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_select_owner_or_admin"
ON public.clients
FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "clients_insert_owner_or_admin"
ON public.clients
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "clients_update_owner_or_admin"
ON public.clients
FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "clients_delete_owner_or_admin"
ON public.clients
FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_orders_select_owner_or_admin"
ON public.service_orders
FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service_orders_insert_owner_or_admin"
ON public.service_orders
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "service_orders_update_owner_or_admin"
ON public.service_orders
FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service_orders_delete_owner_or_admin"
ON public.service_orders
FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_orders_select_owner_or_admin"
ON public.payment_orders
FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "payment_orders_insert_owner_or_admin"
ON public.payment_orders
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "payment_orders_update_owner_or_admin"
ON public.payment_orders
FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "payment_orders_delete_owner_or_admin"
ON public.payment_orders
FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.financial_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financial_records_select_owner_or_admin"
ON public.financial_records
FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "financial_records_insert_owner_or_admin"
ON public.financial_records
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "financial_records_update_owner_or_admin"
ON public.financial_records
FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "financial_records_delete_owner_or_admin"
ON public.financial_records
FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles_select_owner_or_admin"
ON public.vehicles
FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "vehicles_insert_owner_or_admin"
ON public.vehicles
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "vehicles_update_owner_or_admin"
ON public.vehicles
FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "vehicles_delete_owner_or_admin"
ON public.vehicles
FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_select_owner_or_admin"
ON public.documents
FOR SELECT TO authenticated
USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "documents_insert_owner_or_admin"
ON public.documents
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "documents_update_owner_or_admin"
ON public.documents
FOR UPDATE TO authenticated
USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "documents_delete_owner_or_admin"
ON public.documents
FOR DELETE TO authenticated
USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- App-level users entity (profiles)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_owner_or_admin"
ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles_insert_owner_or_admin"
ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "profiles_update_owner_or_admin"
ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles_delete_owner_or_admin"
ON public.profiles
FOR DELETE TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));