
-- 1) USER SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  can_view_other_users boolean NOT NULL DEFAULT false,
  can_view_workspace_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "us_select_self_or_admin"
  ON public.user_settings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "us_insert_self_or_admin"
  ON public.user_settings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "us_update_self_or_admin"
  ON public.user_settings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "us_delete_admin"
  ON public.user_settings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_user_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_user_settings ON public.user_settings;
CREATE TRIGGER trg_touch_user_settings
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_settings_updated_at();

-- Backfill: ensure every existing profile has a user_settings row
INSERT INTO public.user_settings (user_id)
SELECT p.id FROM public.profiles p
LEFT JOIN public.user_settings s ON s.user_id = p.id
WHERE s.id IS NULL;

-- Auto-create user_settings on new profile
CREATE OR REPLACE FUNCTION public.create_user_settings_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_settings(user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_create_settings ON public.profiles;
CREATE TRIGGER trg_profiles_create_settings
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_user_settings_for_profile();

-- 2) HELPER: has_global_view
-- Returns true if user is admin OR has can_view_workspace_data = true
CREATE OR REPLACE FUNCTION public.has_global_view(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR COALESCE(
      (SELECT can_view_workspace_data FROM public.user_settings WHERE user_id = _user_id LIMIT 1),
      false
    )
$$;

-- 3) UPDATE RLS POLICIES TO RESPECT has_global_view

-- service_orders
DROP POLICY IF EXISTS "secure_select" ON public.service_orders;
CREATE POLICY "secure_select"
  ON public.service_orders FOR SELECT
  USING (
    public.has_global_view(auth.uid())
    OR technician_id = public.get_my_technician_id()
    OR (client_id IS NOT NULL AND public.can_access_client(auth.uid(), client_id))
  );

DROP POLICY IF EXISTS "secure_update" ON public.service_orders;
CREATE POLICY "secure_update"
  ON public.service_orders FOR UPDATE
  USING (
    public.has_global_view(auth.uid())
    OR technician_id = public.get_my_technician_id()
  );

-- payment_orders: keep existing scoped policies but add global_view shortcut via SELECT
DROP POLICY IF EXISTS "po_select_scoped" ON public.payment_orders;
CREATE POLICY "po_select_scoped"
  ON public.payment_orders FOR SELECT
  TO authenticated
  USING (
    public.has_global_view(auth.uid())
    OR public.row_in_scope(auth.uid(), 'payment_orders'::text, 'view'::text, created_by, group_id)
    OR (technician_id IS NOT NULL AND technician_id = public.get_my_technician_id())
    OR (client_id IS NOT NULL AND public.can_access_client(auth.uid(), client_id))
  );

-- financial_records
DROP POLICY IF EXISTS "financial_records_select_tech" ON public.financial_records;
CREATE POLICY "financial_records_select_tech"
  ON public.financial_records FOR SELECT
  TO authenticated
  USING (
    public.has_global_view(auth.uid())
    OR technician_id = public.get_my_technician_id()
  );
