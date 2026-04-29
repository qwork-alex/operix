-- Ensure every main writable table has a user_id linked to the authenticated user
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.financial_records
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- Backfill from the best existing owner columns
UPDATE public.service_orders
SET user_id = COALESCE(user_id, assigned_user_id, created_by)
WHERE user_id IS NULL;

UPDATE public.payment_orders
SET user_id = COALESCE(user_id, assigned_user_id, created_by)
WHERE user_id IS NULL;

UPDATE public.financial_records
SET user_id = COALESCE(user_id, assigned_user_id, created_by)
WHERE user_id IS NULL;

UPDATE public.clients
SET user_id = COALESCE(user_id, created_by)
WHERE user_id IS NULL;

UPDATE public.company_settings
SET user_id = COALESCE(user_id, public.company_settings.user_id)
WHERE user_id IS NULL;

-- Helper trigger: auto-assign auth.uid() to user_id, created_by and assigned_user_id when available
CREATE OR REPLACE FUNCTION public.set_user_id_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF to_jsonb(NEW) ? 'user_id' AND NEW.user_id IS NULL THEN
    NEW.user_id := v_uid;
  END IF;

  IF to_jsonb(NEW) ? 'created_by' AND NEW.created_by IS NULL THEN
    NEW.created_by := v_uid;
  END IF;

  IF to_jsonb(NEW) ? 'assigned_user_id' AND NEW.assigned_user_id IS NULL THEN
    NEW.assigned_user_id := v_uid;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_user_id_service_orders ON public.service_orders;
CREATE TRIGGER set_user_id_service_orders
BEFORE INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.set_user_id_from_auth();

DROP TRIGGER IF EXISTS set_user_id_payment_orders ON public.payment_orders;
CREATE TRIGGER set_user_id_payment_orders
BEFORE INSERT OR UPDATE ON public.payment_orders
FOR EACH ROW EXECUTE FUNCTION public.set_user_id_from_auth();

DROP TRIGGER IF EXISTS set_user_id_financial_records ON public.financial_records;
CREATE TRIGGER set_user_id_financial_records
BEFORE INSERT OR UPDATE ON public.financial_records
FOR EACH ROW EXECUTE FUNCTION public.set_user_id_from_auth();

DROP TRIGGER IF EXISTS set_user_id_clients ON public.clients;
CREATE TRIGGER set_user_id_clients
BEFORE INSERT OR UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.set_user_id_from_auth();

DROP TRIGGER IF EXISTS set_user_id_company_settings ON public.company_settings;
CREATE TRIGGER set_user_id_company_settings
BEFORE INSERT OR UPDATE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.set_user_id_from_auth();

CREATE INDEX IF NOT EXISTS idx_service_orders_user_id ON public.service_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON public.payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_user_id ON public.financial_records(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_company_settings_user_id ON public.company_settings(user_id);

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Service orders: own-user access plus admin override
DROP POLICY IF EXISTS insert_service_orders ON public.service_orders;
DROP POLICY IF EXISTS select_service_orders ON public.service_orders;
DROP POLICY IF EXISTS service_orders_update ON public.service_orders;
DROP POLICY IF EXISTS service_orders_delete ON public.service_orders;

CREATE POLICY select_service_orders ON public.service_orders
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR assigned_user_id = auth.uid()
  OR created_by = auth.uid()
);

CREATE POLICY insert_service_orders ON public.service_orders
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR user_id IS NULL
  OR assigned_user_id = auth.uid()
);

CREATE POLICY service_orders_update ON public.service_orders
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR assigned_user_id = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR assigned_user_id = auth.uid()
  OR created_by = auth.uid()
);

CREATE POLICY service_orders_delete ON public.service_orders
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

-- Payment orders: own-user access plus admin override
DROP POLICY IF EXISTS po_select_scoped ON public.payment_orders;
DROP POLICY IF EXISTS po_insert_scoped ON public.payment_orders;
DROP POLICY IF EXISTS po_update_scoped ON public.payment_orders;
DROP POLICY IF EXISTS po_delete_scoped ON public.payment_orders;

CREATE POLICY po_select_scoped ON public.payment_orders
FOR SELECT TO authenticated
USING (
  has_global_view(auth.uid())
  OR user_id = auth.uid()
  OR assigned_user_id = auth.uid()
  OR created_by = auth.uid()
);

CREATE POLICY po_insert_scoped ON public.payment_orders
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR user_id IS NULL
  OR assigned_user_id = auth.uid()
);

CREATE POLICY po_update_scoped ON public.payment_orders
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR assigned_user_id = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR assigned_user_id = auth.uid()
  OR created_by = auth.uid()
);

CREATE POLICY po_delete_scoped ON public.payment_orders
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

-- Financial records: own-user access plus admin/global view
DROP POLICY IF EXISTS financial_records_select_assigned ON public.financial_records;
DROP POLICY IF EXISTS financial_records_insert_assigned ON public.financial_records;
DROP POLICY IF EXISTS financial_records_update_assigned ON public.financial_records;
DROP POLICY IF EXISTS financial_records_delete_admin ON public.financial_records;

CREATE POLICY financial_records_select_assigned ON public.financial_records
FOR SELECT TO authenticated
USING (
  has_global_view(auth.uid())
  OR user_id = auth.uid()
  OR assigned_user_id = auth.uid()
  OR created_by = auth.uid()
);

CREATE POLICY financial_records_insert_assigned ON public.financial_records
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR user_id IS NULL
  OR assigned_user_id = auth.uid()
);

CREATE POLICY financial_records_update_assigned ON public.financial_records
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR assigned_user_id = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR assigned_user_id = auth.uid()
  OR created_by = auth.uid()
);

CREATE POLICY financial_records_delete_admin ON public.financial_records
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

-- Clients: keep existing permission model, add own-user fallback
DROP POLICY IF EXISTS clients_select_scoped ON public.clients;
DROP POLICY IF EXISTS clients_insert_scoped ON public.clients;
DROP POLICY IF EXISTS clients_update_scoped ON public.clients;
DROP POLICY IF EXISTS clients_delete_scoped ON public.clients;

CREATE POLICY clients_select_scoped ON public.clients
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR created_by = auth.uid()
  OR has_role(auth.uid(), 'partner'::app_role)
  OR can_do(auth.uid(), 'service_orders'::text, 'view'::text)
  OR can_do(auth.uid(), 'payment_orders'::text, 'view'::text)
  OR can_do(auth.uid(), 'financial'::text, 'view'::text)
  OR can_do(auth.uid(), 'documents'::text, 'view'::text)
  OR can_access_client(auth.uid(), id)
);

CREATE POLICY clients_insert_scoped ON public.clients
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR user_id IS NULL
  OR can_do(auth.uid(), 'service_orders'::text, 'create'::text)
  OR can_do(auth.uid(), 'payment_orders'::text, 'create'::text)
  OR can_do(auth.uid(), 'documents'::text, 'create'::text)
);

CREATE POLICY clients_update_scoped ON public.clients
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR created_by = auth.uid()
  OR can_do(auth.uid(), 'service_orders'::text, 'edit'::text)
  OR can_do(auth.uid(), 'payment_orders'::text, 'edit'::text)
  OR can_do(auth.uid(), 'documents'::text, 'edit'::text)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR created_by = auth.uid()
  OR can_do(auth.uid(), 'service_orders'::text, 'edit'::text)
  OR can_do(auth.uid(), 'payment_orders'::text, 'edit'::text)
  OR can_do(auth.uid(), 'documents'::text, 'edit'::text)
);

CREATE POLICY clients_delete_scoped ON public.clients
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR created_by = auth.uid()
  OR can_do(auth.uid(), 'service_orders'::text, 'delete'::text)
  OR can_do(auth.uid(), 'payment_orders'::text, 'delete'::text)
  OR can_do(auth.uid(), 'documents'::text, 'delete'::text)
);

-- Company settings: authenticated users can save their own settings, admins can manage all
DROP POLICY IF EXISTS cs_admin_all ON public.company_settings;
DROP POLICY IF EXISTS cs_select_auth ON public.company_settings;
DROP POLICY IF EXISTS company_settings_select_own ON public.company_settings;
DROP POLICY IF EXISTS company_settings_insert_own ON public.company_settings;
DROP POLICY IF EXISTS company_settings_update_own ON public.company_settings;
DROP POLICY IF EXISTS company_settings_delete_own ON public.company_settings;

CREATE POLICY company_settings_select_own ON public.company_settings
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

CREATE POLICY company_settings_insert_own ON public.company_settings
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY company_settings_update_own ON public.company_settings
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

CREATE POLICY company_settings_delete_own ON public.company_settings
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());