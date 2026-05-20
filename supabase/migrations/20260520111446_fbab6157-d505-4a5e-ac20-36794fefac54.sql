
-- =====================================================================
-- WORKSPACE CONTEXT ENGINE — Phase 1 (additive, retry with replica-mode backfill)
-- =====================================================================

-- 1. workspace_id where missing
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payment_orders','financial_records','billing_invoices','billing_payments',
    'billing_clients','billing_suppliers','clients','notifications',
    'fleet_trips','fleet_fuel_logs','drivers','hail_reports','discrepancies',
    'billing_attachments','billing_reconciliations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id uuid', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_workspace_id ON public.%I(workspace_id)', t, t);
  END LOOP;
END $$;

-- 2. year_reference
ALTER TABLE public.service_orders    ADD COLUMN IF NOT EXISTS year_reference int;
ALTER TABLE public.payment_orders    ADD COLUMN IF NOT EXISTS year_reference int;
ALTER TABLE public.financial_records ADD COLUMN IF NOT EXISTS year_reference int;
ALTER TABLE public.billing_invoices  ADD COLUMN IF NOT EXISTS year_reference int;

CREATE INDEX IF NOT EXISTS idx_so_ws_year ON public.service_orders(workspace_id, year_reference);
CREATE INDEX IF NOT EXISTS idx_po_ws_year ON public.payment_orders(workspace_id, year_reference);
CREATE INDEX IF NOT EXISTS idx_fr_ws_year ON public.financial_records(workspace_id, year_reference);
CREATE INDEX IF NOT EXISTS idx_bi_ws_year ON public.billing_invoices(workspace_id, year_reference);

-- 3. visibility_scope
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'service_orders','payment_orders','financial_records','billing_invoices',
    'documents','clients','billing_clients'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS visibility_scope text NOT NULL DEFAULT ''workspace''', t
    );
  END LOOP;
END $$;

-- 4. workspace_module_permissions
CREATE TABLE IF NOT EXISTS public.workspace_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  module text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, module)
);
ALTER TABLE public.workspace_module_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wmp_select ON public.workspace_module_permissions;
CREATE POLICY wmp_select ON public.workspace_module_permissions
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      JOIN public.app_users a ON a.id = m.user_id
      WHERE a.auth_user_id = auth.uid()
        AND m.workspace_id = workspace_module_permissions.workspace_id
        AND m.status = 'active'
    )
  );
DROP POLICY IF EXISTS wmp_admin_all ON public.workspace_module_permissions;
CREATE POLICY wmp_admin_all ON public.workspace_module_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_wmp_workspace ON public.workspace_module_permissions(workspace_id);

-- 5. Resolver functions
CREATE OR REPLACE FUNCTION public.get_user_workspaces(_uid uuid DEFAULT NULL)
RETURNS TABLE(workspace_id uuid, workspace_name text, role text, is_owner boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH u AS (SELECT COALESCE(_uid, auth.uid()) AS uid)
  SELECT w.id, w.name, m.role::text, (w.owner_user_id = a.id)
  FROM public.memberships m
  JOIN public.app_users a ON a.id = m.user_id
  JOIN public.workspaces w ON w.id = m.workspace_id
  JOIN u ON a.auth_user_id = u.uid
  WHERE m.status = 'active'
  ORDER BY (w.owner_user_id = a.id) DESC, w.name;
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_workspace(_uid uuid, _ws_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    JOIN public.app_users a ON a.id = m.user_id
    WHERE a.auth_user_id = _uid AND m.workspace_id = _ws_id AND m.status = 'active'
  ) OR public.has_role(_uid, 'admin'::app_role);
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_module(_uid uuid, _ws_id uuid, _module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.user_can_access_workspace(_uid, _ws_id)
    AND COALESCE(
      (SELECT enabled FROM public.workspace_module_permissions
        WHERE workspace_id = _ws_id AND module = _module LIMIT 1), true);
$$;

-- 6. Backfill with replica mode (bypasses user triggers like apply_order_owner)
DO $$
DECLARE
  v_default_ws uuid;
BEGIN
  SET LOCAL session_replication_role = 'replica';
  SELECT id INTO v_default_ws FROM public.workspaces ORDER BY created_at LIMIT 1;

  UPDATE public.service_orders so SET workspace_id = COALESCE(
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = so.created_by LIMIT 1),
    (SELECT m.workspace_id FROM public.memberships m JOIN public.app_users a ON a.id = m.user_id
       WHERE a.auth_user_id = so.created_by AND m.status='active' LIMIT 1),
    v_default_ws)
    WHERE so.workspace_id IS NULL;

  UPDATE public.payment_orders po SET workspace_id = COALESCE(
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = po.created_by LIMIT 1),
    (SELECT so2.workspace_id FROM public.service_orders so2 WHERE so2.id = po.service_order_id LIMIT 1),
    v_default_ws)
    WHERE po.workspace_id IS NULL;

  UPDATE public.financial_records fr SET workspace_id = COALESCE(
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = fr.created_by LIMIT 1),
    (SELECT so2.workspace_id FROM public.service_orders so2 WHERE so2.id = fr.service_order_id LIMIT 1),
    v_default_ws)
    WHERE fr.workspace_id IS NULL;

  UPDATE public.billing_invoices bi SET workspace_id = COALESCE(
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = bi.created_by LIMIT 1),
    v_default_ws)
    WHERE bi.workspace_id IS NULL;

  UPDATE public.billing_payments bp SET workspace_id = COALESCE(
    (SELECT bi2.workspace_id FROM public.billing_invoices bi2 WHERE bi2.id = bp.invoice_id LIMIT 1),
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = bp.created_by LIMIT 1),
    v_default_ws)
    WHERE bp.workspace_id IS NULL;

  UPDATE public.billing_clients SET workspace_id = COALESCE(
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = created_by LIMIT 1), v_default_ws)
    WHERE workspace_id IS NULL;
  UPDATE public.billing_suppliers SET workspace_id = COALESCE(
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = created_by LIMIT 1), v_default_ws)
    WHERE workspace_id IS NULL;
  UPDATE public.billing_attachments SET workspace_id = COALESCE(
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = uploaded_by LIMIT 1), v_default_ws)
    WHERE workspace_id IS NULL;
  UPDATE public.billing_reconciliations SET workspace_id = COALESCE(
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = created_by LIMIT 1), v_default_ws)
    WHERE workspace_id IS NULL;

  UPDATE public.clients SET workspace_id = COALESCE(
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = created_by LIMIT 1), v_default_ws)
    WHERE workspace_id IS NULL;

  UPDATE public.notifications SET workspace_id = COALESCE(
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = user_id LIMIT 1), v_default_ws)
    WHERE workspace_id IS NULL;

  UPDATE public.fleet_trips SET workspace_id = COALESCE(
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = created_by LIMIT 1), v_default_ws)
    WHERE workspace_id IS NULL;
  UPDATE public.fleet_fuel_logs SET workspace_id = COALESCE(
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = created_by LIMIT 1), v_default_ws)
    WHERE workspace_id IS NULL;
  UPDATE public.drivers SET workspace_id = COALESCE(
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = created_by LIMIT 1), v_default_ws)
    WHERE workspace_id IS NULL;

  UPDATE public.hail_reports SET workspace_id = COALESCE(
    (SELECT au.workspace_id FROM public.app_users au WHERE au.auth_user_id = reporter_user_id LIMIT 1), v_default_ws)
    WHERE workspace_id IS NULL;
  UPDATE public.discrepancies d SET workspace_id = COALESCE(
    (SELECT so2.workspace_id FROM public.service_orders so2 WHERE so2.id = d.service_order_id LIMIT 1), v_default_ws)
    WHERE d.workspace_id IS NULL;

  UPDATE public.service_orders    SET year_reference = extract(year from created_at)::int WHERE year_reference IS NULL;
  UPDATE public.payment_orders    SET year_reference = extract(year from created_at)::int WHERE year_reference IS NULL;
  UPDATE public.financial_records SET year_reference = extract(year from created_at)::int WHERE year_reference IS NULL;
  UPDATE public.billing_invoices  SET year_reference = extract(year from issue_date)::int   WHERE year_reference IS NULL;
END $$;

-- 7. Auto-fill triggers
CREATE OR REPLACE FUNCTION public.set_year_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.year_reference IS NULL THEN
    NEW.year_reference := extract(year from COALESCE(
      CASE WHEN TG_TABLE_NAME='billing_invoices' THEN NEW.issue_date::timestamptz ELSE NULL END,
      NEW.created_at, now()
    ))::int;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_so_year_ref ON public.service_orders;
DROP TRIGGER IF EXISTS trg_po_year_ref ON public.payment_orders;
DROP TRIGGER IF EXISTS trg_fr_year_ref ON public.financial_records;
DROP TRIGGER IF EXISTS trg_bi_year_ref ON public.billing_invoices;
CREATE TRIGGER trg_so_year_ref BEFORE INSERT ON public.service_orders    FOR EACH ROW EXECUTE FUNCTION public.set_year_reference();
CREATE TRIGGER trg_po_year_ref BEFORE INSERT ON public.payment_orders    FOR EACH ROW EXECUTE FUNCTION public.set_year_reference();
CREATE TRIGGER trg_fr_year_ref BEFORE INSERT ON public.financial_records FOR EACH ROW EXECUTE FUNCTION public.set_year_reference();
CREATE TRIGGER trg_bi_year_ref BEFORE INSERT ON public.billing_invoices  FOR EACH ROW EXECUTE FUNCTION public.set_year_reference();

CREATE OR REPLACE FUNCTION public.set_workspace_id_from_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_creator uuid;
  v_ws uuid;
BEGIN
  IF NEW.workspace_id IS NOT NULL THEN RETURN NEW; END IF;

  v_creator := COALESCE(
    CASE WHEN TG_TABLE_NAME = 'billing_attachments' THEN (to_jsonb(NEW)->>'uploaded_by')::uuid ELSE NULL END,
    (to_jsonb(NEW)->>'created_by')::uuid,
    (to_jsonb(NEW)->>'user_id')::uuid,
    v_uid
  );

  SELECT au.workspace_id INTO v_ws FROM public.app_users au WHERE au.auth_user_id = v_creator LIMIT 1;
  IF v_ws IS NULL THEN
    SELECT m.workspace_id INTO v_ws FROM public.memberships m
      JOIN public.app_users a ON a.id = m.user_id
      WHERE a.auth_user_id = v_creator AND m.status='active' LIMIT 1;
  END IF;

  NEW.workspace_id := v_ws;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payment_orders','financial_records','billing_invoices','billing_payments',
    'billing_clients','billing_suppliers','billing_attachments','billing_reconciliations',
    'clients','notifications','fleet_trips','fleet_fuel_logs','drivers',
    'hail_reports','discrepancies'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_ws_autofill ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_ws_autofill BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_creator()', t, t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_wmp_updated ON public.workspace_module_permissions;
CREATE TRIGGER trg_wmp_updated BEFORE UPDATE ON public.workspace_module_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
