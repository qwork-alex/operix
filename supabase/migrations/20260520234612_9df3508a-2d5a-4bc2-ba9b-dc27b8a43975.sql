
-- ============================================================
-- Phase 3 — Operational Hardening (additive only)
-- ============================================================

-- 1. Soft-delete columns on safety-critical tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'service_orders','payment_orders','billing_invoices','financial_records',
    'clients','vehicles','drivers','fleet_fuel_logs','fleet_trips'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_by UUID', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_reason TEXT', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_deleted_at ON public.%I (deleted_at) WHERE deleted_at IS NOT NULL', t, t);
    END IF;
  END LOOP;
END $$;

-- 2. Soft delete RPC
CREATE OR REPLACE FUNCTION public.soft_delete_record(
  _table text,
  _row_id uuid,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed text[] := ARRAY[
    'service_orders','payment_orders','billing_invoices','financial_records',
    'clients','vehicles','drivers','fleet_fuel_logs','fleet_trips'
  ];
  v_rows int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT (_table = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'table % is not soft-deletable', _table USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'partner'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'insufficient privileges' USING ERRCODE = '42501';
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = now(), deleted_by = $1, deleted_reason = $2
       WHERE id = $3 AND deleted_at IS NULL',
    _table
  ) USING v_uid, _reason, _row_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO public.backend_event_logs(table_name, action, row_id, actor_user_id, payload)
  VALUES (_table, 'SOFT_DELETE', _row_id, v_uid,
          jsonb_build_object('reason', _reason, 'rows', v_rows));

  RETURN jsonb_build_object('success', v_rows > 0, 'table', _table, 'id', _row_id);
END $$;

-- 3. Restore RPC
CREATE OR REPLACE FUNCTION public.restore_record(_table text, _row_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed text[] := ARRAY[
    'service_orders','payment_orders','billing_invoices','financial_records',
    'clients','vehicles','drivers','fleet_fuel_logs','fleet_trips'
  ];
  v_rows int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT (_table = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'table % is not restorable', _table USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'partner'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'insufficient privileges' USING ERRCODE = '42501';
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL, deleted_reason = NULL
       WHERE id = $1 AND deleted_at IS NOT NULL',
    _table
  ) USING _row_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO public.backend_event_logs(table_name, action, row_id, actor_user_id, payload)
  VALUES (_table, 'RESTORE', _row_id, v_uid,
          jsonb_build_object('rows', v_rows));

  RETURN jsonb_build_object('success', v_rows > 0, 'table', _table, 'id', _row_id);
END $$;

-- 4. Recovery view — recently archived items (last 90 days)
CREATE OR REPLACE VIEW public.recoverable_items AS
  SELECT 'service_orders'::text AS entity_type, so.id, so.workspace_id, so.deleted_at, so.deleted_by, so.deleted_reason,
         COALESCE(NULLIF(trim(coalesce(so.car_name,'') || ' ' || coalesce(so.license_plate,'')), ''), so.id::text) AS label
    FROM public.service_orders so
   WHERE so.deleted_at IS NOT NULL AND so.deleted_at > now() - interval '90 days'
  UNION ALL
  SELECT 'payment_orders', po.id, po.workspace_id, po.deleted_at, po.deleted_by, po.deleted_reason,
         COALESCE(NULLIF(trim(coalesce(po.car_name,'') || ' ' || coalesce(po.license_plate,'')), ''), po.id::text)
    FROM public.payment_orders po
   WHERE po.deleted_at IS NOT NULL AND po.deleted_at > now() - interval '90 days'
  UNION ALL
  SELECT 'billing_invoices', bi.id, bi.workspace_id, bi.deleted_at, bi.deleted_by, bi.deleted_reason,
         COALESCE(bi.invoice_number, bi.id::text)
    FROM public.billing_invoices bi
   WHERE bi.deleted_at IS NOT NULL AND bi.deleted_at > now() - interval '90 days'
  UNION ALL
  SELECT 'financial_records', fr.id, fr.workspace_id, fr.deleted_at, fr.deleted_by, fr.deleted_reason,
         COALESCE(fr.label, fr.notes, fr.id::text)
    FROM public.financial_records fr
   WHERE fr.deleted_at IS NOT NULL AND fr.deleted_at > now() - interval '90 days'
  UNION ALL
  SELECT 'clients', c.id, c.workspace_id, c.deleted_at, c.deleted_by, c.deleted_reason,
         COALESCE(c.name, c.id::text)
    FROM public.clients c
   WHERE c.deleted_at IS NOT NULL AND c.deleted_at > now() - interval '90 days'
  UNION ALL
  SELECT 'vehicles', v.id, NULL::uuid, v.deleted_at, v.deleted_by, v.deleted_reason,
         COALESCE(NULLIF(trim(coalesce(v.name,'') || ' ' || coalesce(v.license_plate,'')), ''), v.id::text)
    FROM public.vehicles v
   WHERE v.deleted_at IS NOT NULL AND v.deleted_at > now() - interval '90 days'
  UNION ALL
  SELECT 'drivers', d.id, d.workspace_id, d.deleted_at, d.deleted_by, d.deleted_reason,
         COALESCE(d.full_name, d.id::text)
    FROM public.drivers d
   WHERE d.deleted_at IS NOT NULL AND d.deleted_at > now() - interval '90 days'
  UNION ALL
  SELECT 'fleet_fuel_logs', f.id, f.workspace_id, f.deleted_at, f.deleted_by, f.deleted_reason,
         COALESCE(to_char(f.date, 'YYYY-MM-DD') || ' • ' || f.liters::text || 'L', f.id::text)
    FROM public.fleet_fuel_logs f
   WHERE f.deleted_at IS NOT NULL AND f.deleted_at > now() - interval '90 days'
  UNION ALL
  SELECT 'fleet_trips', t.id, t.workspace_id, t.deleted_at, t.deleted_by, t.deleted_reason,
         COALESCE(to_char(t.date, 'YYYY-MM-DD') || ' • ' || coalesce(t.total_distance::text || ' km',''), t.id::text)
    FROM public.fleet_trips t
   WHERE t.deleted_at IS NOT NULL AND t.deleted_at > now() - interval '90 days';

-- 5. List recoverable items RPC — workspace-scoped
CREATE OR REPLACE FUNCTION public.list_recoverable_items()
RETURNS TABLE(
  entity_type text,
  id uuid,
  workspace_id uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_reason text,
  label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT r.entity_type, r.id, r.workspace_id, r.deleted_at, r.deleted_by, r.deleted_reason, r.label
    FROM public.recoverable_items r
   WHERE r.workspace_id IS NULL
      OR r.workspace_id IN (SELECT public.current_user_workspace_ids())
      OR public.has_role(v_uid, 'admin'::public.app_role)
   ORDER BY r.deleted_at DESC;
END $$;

-- 6. Audit log read RPC — admin only
CREATE OR REPLACE FUNCTION public.list_audit_events(
  _limit int DEFAULT 200,
  _table_filter text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  table_name text,
  action text,
  row_id uuid,
  actor_user_id uuid,
  payload jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT bel.id, bel.created_at, bel.table_name, bel.action, bel.row_id, bel.actor_user_id, bel.payload
    FROM public.backend_event_logs bel
   WHERE (_table_filter IS NULL OR bel.table_name = _table_filter)
   ORDER BY bel.created_at DESC
   LIMIT GREATEST(1, LEAST(_limit, 1000));
END $$;

GRANT EXECUTE ON FUNCTION public.soft_delete_record(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_record(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_recoverable_items() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_audit_events(int, text) TO authenticated;
