
DROP VIEW IF EXISTS public.v_financial_integrity_summary CASCADE;

DO $$ BEGIN
  CREATE TYPE public.integrity_severity AS ENUM ('info','warning','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.integrity_status AS ENUM ('open','investigating','ignored','resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.integrity_issue_type AS ENUM (
    'duplicate_event','orphan_record','mismatch_total','invalid_distribution',
    'stale_summary','workspace_leak','year_leak','negative_balance',
    'missing_reference','broken_sync','invalid_participation','impossible_amount',
    'duplicate_hash','reconciliation_failure','drift_detected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.financial_integrity_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  year_reference integer,
  severity public.integrity_severity NOT NULL DEFAULT 'warning',
  issue_type public.integrity_issue_type NOT NULL,
  entity_type text,
  entity_id uuid,
  reference_id uuid,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  status public.integrity_status NOT NULL DEFAULT 'open',
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  hash text,
  created_by_system text NOT NULL DEFAULT 'integrity_engine',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fii_hash_active
  ON public.financial_integrity_issues (hash)
  WHERE hash IS NOT NULL AND status <> 'resolved';
CREATE INDEX IF NOT EXISTS idx_fii_workspace_year
  ON public.financial_integrity_issues (workspace_id, year_reference);
CREATE INDEX IF NOT EXISTS idx_fii_status_severity
  ON public.financial_integrity_issues (status, severity);
CREATE INDEX IF NOT EXISTS idx_fii_detected_at
  ON public.financial_integrity_issues (detected_at DESC);

ALTER TABLE public.financial_integrity_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fii_select ON public.financial_integrity_issues;
CREATE POLICY fii_select ON public.financial_integrity_issues
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR (workspace_id IS NOT NULL AND is_workspace_member(auth.uid(), workspace_id))
  );

DROP POLICY IF EXISTS fii_update ON public.financial_integrity_issues;
CREATE POLICY fii_update ON public.financial_integrity_issues
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role));

CREATE TABLE IF NOT EXISTS public.financial_integrity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  year_reference integer NOT NULL,
  snapshot_type text NOT NULL DEFAULT 'manual',
  snapshot_hash text,
  total_received numeric NOT NULL DEFAULT 0,
  total_expected numeric NOT NULL DEFAULT 0,
  total_pending numeric NOT NULL DEFAULT 0,
  total_distributed numeric NOT NULL DEFAULT 0,
  total_expenses numeric NOT NULL DEFAULT 0,
  total_profit numeric NOT NULL DEFAULT 0,
  total_os integer NOT NULL DEFAULT 0,
  total_op integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fis_workspace_year
  ON public.financial_integrity_snapshots (workspace_id, year_reference, created_at DESC);

ALTER TABLE public.financial_integrity_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fis_select ON public.financial_integrity_snapshots;
CREATE POLICY fis_select ON public.financial_integrity_snapshots
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR (workspace_id IS NOT NULL AND is_workspace_member(auth.uid(), workspace_id))
  );

DROP TRIGGER IF EXISTS trg_fii_touch ON public.financial_integrity_issues;
CREATE TRIGGER trg_fii_touch
  BEFORE UPDATE ON public.financial_integrity_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.run_financial_integrity_check(
  _workspace_id uuid DEFAULT NULL,
  _year integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := COALESCE(_year, EXTRACT(YEAR FROM now())::int);
  v_inserted integer := 0;
  v_critical integer := 0;
  v_warning integer := 0;
  v_info integer := 0;
  v_run_id uuid := gen_random_uuid();
  v_stored_received numeric := 0;
  v_stored_expected numeric := 0;
BEGIN
  -- CHECK 1: duplicate financial_events by event_hash
  INSERT INTO public.financial_integrity_issues
    (workspace_id, year_reference, severity, issue_type, entity_type, entity_id, hash, details_json)
  SELECT fe.workspace_id, v_year, 'critical', 'duplicate_event', 'financial_events',
    MIN(fe.id), 'dup_event_' || fe.event_hash,
    jsonb_build_object('event_hash', fe.event_hash, 'count', COUNT(*))
  FROM public.financial_events fe
  WHERE fe.event_hash IS NOT NULL
    AND (_workspace_id IS NULL OR fe.workspace_id = _workspace_id)
    AND EXTRACT(YEAR FROM fe.created_at)::int = v_year
  GROUP BY fe.workspace_id, fe.event_hash
  HAVING COUNT(*) > 1
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_critical := v_critical + v_inserted;

  -- CHECK 2a: orphan financial_records (no workspace_id)
  IF _workspace_id IS NULL THEN
    INSERT INTO public.financial_integrity_issues
      (workspace_id, year_reference, severity, issue_type, entity_type, entity_id, hash, details_json)
    SELECT NULL, v_year, 'warning', 'orphan_record', 'financial_records', fr.id,
      'orphan_fr_' || fr.id::text,
      jsonb_build_object('reason','missing_workspace_id')
    FROM public.financial_records fr
    WHERE fr.workspace_id IS NULL
      AND COALESCE(fr.year_reference, EXTRACT(YEAR FROM fr.created_at)::int) = v_year
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_warning := v_warning + v_inserted;
  END IF;

  -- CHECK 2b: financial_records linked to deleted service order
  INSERT INTO public.financial_integrity_issues
    (workspace_id, year_reference, severity, issue_type, entity_type, entity_id, hash, details_json)
  SELECT fr.workspace_id, v_year, 'critical', 'missing_reference', 'financial_records', fr.id,
    'fr_missing_so_' || fr.id::text,
    jsonb_build_object('service_order_id', fr.service_order_id)
  FROM public.financial_records fr
  LEFT JOIN public.service_orders so ON so.id = fr.service_order_id
  WHERE fr.service_order_id IS NOT NULL AND so.id IS NULL
    AND (_workspace_id IS NULL OR fr.workspace_id = _workspace_id)
    AND COALESCE(fr.year_reference, EXTRACT(YEAR FROM fr.created_at)::int) = v_year
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_critical := v_critical + v_inserted;

  -- CHECK 2c: financial_records linked to deleted payment order
  INSERT INTO public.financial_integrity_issues
    (workspace_id, year_reference, severity, issue_type, entity_type, entity_id, hash, details_json)
  SELECT fr.workspace_id, v_year, 'critical', 'missing_reference', 'financial_records', fr.id,
    'fr_missing_po_' || fr.id::text,
    jsonb_build_object('payment_order_id', fr.payment_order_id)
  FROM public.financial_records fr
  LEFT JOIN public.payment_orders po ON po.id = fr.payment_order_id
  WHERE fr.payment_order_id IS NOT NULL AND po.id IS NULL
    AND (_workspace_id IS NULL OR fr.workspace_id = _workspace_id)
    AND COALESCE(fr.year_reference, EXTRACT(YEAR FROM fr.created_at)::int) = v_year
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_critical := v_critical + v_inserted;

  -- CHECK 2d: orphan distributions
  INSERT INTO public.financial_integrity_issues
    (workspace_id, year_reference, severity, issue_type, entity_type, entity_id, hash, details_json)
  SELECT NULL, v_year, 'critical', 'orphan_record', 'service_order_distributions', sod.id,
    'sod_orphan_' || sod.id::text,
    jsonb_build_object('service_order_id', sod.service_order_id)
  FROM public.service_order_distributions sod
  LEFT JOIN public.service_orders so ON so.id = sod.service_order_id
  WHERE so.id IS NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_critical := v_critical + v_inserted;

  -- CHECK 5: invalid participation sums (> 100% + tolerance)
  INSERT INTO public.financial_integrity_issues
    (workspace_id, year_reference, severity, issue_type, entity_type, entity_id, hash, details_json)
  SELECT so.workspace_id, v_year, 'warning', 'invalid_participation', 'service_orders', so.id,
    'part_sum_' || so.id::text,
    jsonb_build_object('sum_pct', ROUND(SUM(sod.percentage)::numeric, 2))
  FROM public.service_order_distributions sod
  JOIN public.service_orders so ON so.id = sod.service_order_id
  WHERE (_workspace_id IS NULL OR so.workspace_id = _workspace_id)
    AND EXTRACT(YEAR FROM so.created_at)::int = v_year
  GROUP BY so.id, so.workspace_id
  HAVING SUM(sod.percentage) > 100.5 OR SUM(sod.percentage) < -0.01
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_warning := v_warning + v_inserted;

  -- CHECK 6: impossible negative amounts
  INSERT INTO public.financial_integrity_issues
    (workspace_id, year_reference, severity, issue_type, entity_type, entity_id, hash, details_json)
  SELECT so.workspace_id, v_year, 'critical', 'impossible_amount', 'service_orders', so.id,
    'neg_so_' || so.id::text, jsonb_build_object('total', so.total)
  FROM public.service_orders so
  WHERE so.total < 0
    AND (_workspace_id IS NULL OR so.workspace_id = _workspace_id)
    AND EXTRACT(YEAR FROM so.created_at)::int = v_year
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_critical := v_critical + v_inserted;

  INSERT INTO public.financial_integrity_issues
    (workspace_id, year_reference, severity, issue_type, entity_type, entity_id, hash, details_json)
  SELECT po.workspace_id, v_year, 'critical', 'impossible_amount', 'payment_orders', po.id,
    'neg_po_' || po.id::text, jsonb_build_object('total', po.total)
  FROM public.payment_orders po
  WHERE po.total < 0
    AND (_workspace_id IS NULL OR po.workspace_id = _workspace_id)
    AND EXTRACT(YEAR FROM po.created_at)::int = v_year
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_critical := v_critical + v_inserted;

  -- Aggregate totals for snapshot
  SELECT COALESCE(SUM(so.total),0) INTO v_stored_expected
  FROM public.service_orders so
  WHERE (_workspace_id IS NULL OR so.workspace_id = _workspace_id)
    AND EXTRACT(YEAR FROM so.created_at)::int = v_year;

  SELECT COALESCE(SUM(po.total),0) INTO v_stored_received
  FROM public.payment_orders po
  WHERE (_workspace_id IS NULL OR po.workspace_id = _workspace_id)
    AND EXTRACT(YEAR FROM po.created_at)::int = v_year;

  INSERT INTO public.financial_integrity_snapshots
    (workspace_id, year_reference, snapshot_type, snapshot_hash,
     total_received, total_expected, total_pending, total_distributed, total_expenses, total_profit,
     total_os, total_op)
  SELECT
    _workspace_id, v_year, 'check_run',
    encode(digest(v_run_id::text || v_year::text, 'sha256'), 'hex'),
    v_stored_received, v_stored_expected,
    GREATEST(v_stored_expected - v_stored_received, 0),
    COALESCE((SELECT SUM(calculated_value) FROM public.service_order_distributions sod
      JOIN public.service_orders so2 ON so2.id = sod.service_order_id
      WHERE (_workspace_id IS NULL OR so2.workspace_id = _workspace_id)
        AND EXTRACT(YEAR FROM so2.created_at)::int = v_year), 0),
    COALESCE((SELECT SUM(amount) FROM public.financial_records fr
      WHERE fr.type = 'expense'
        AND (_workspace_id IS NULL OR fr.workspace_id = _workspace_id)
        AND COALESCE(fr.year_reference, EXTRACT(YEAR FROM fr.created_at)::int) = v_year), 0),
    v_stored_received -
      COALESCE((SELECT SUM(amount) FROM public.financial_records fr
        WHERE fr.type = 'expense'
          AND (_workspace_id IS NULL OR fr.workspace_id = _workspace_id)
          AND COALESCE(fr.year_reference, EXTRACT(YEAR FROM fr.created_at)::int) = v_year), 0),
    (SELECT COUNT(*) FROM public.service_orders so3
      WHERE (_workspace_id IS NULL OR so3.workspace_id = _workspace_id)
        AND EXTRACT(YEAR FROM so3.created_at)::int = v_year),
    (SELECT COUNT(*) FROM public.payment_orders po3
      WHERE (_workspace_id IS NULL OR po3.workspace_id = _workspace_id)
        AND EXTRACT(YEAR FROM po3.created_at)::int = v_year);

  INSERT INTO public.backend_event_logs(table_name, action, row_id, actor_user_id, payload)
  VALUES ('financial_integrity_issues', 'INTEGRITY_RUN', v_run_id, auth.uid(),
    jsonb_build_object('workspace_id', _workspace_id, 'year_reference', v_year,
      'critical', v_critical, 'warning', v_warning, 'info', v_info,
      'totals', jsonb_build_object('expected', v_stored_expected, 'received', v_stored_received)));

  RETURN jsonb_build_object(
    'run_id', v_run_id, 'workspace_id', _workspace_id, 'year_reference', v_year,
    'critical', v_critical, 'warning', v_warning, 'info', v_info,
    'totals', jsonb_build_object('expected', v_stored_expected, 'received', v_stored_received));
END;
$$;

REVOKE ALL ON FUNCTION public.run_financial_integrity_check(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.run_financial_integrity_check(uuid, integer) TO authenticated;

CREATE OR REPLACE VIEW public.v_financial_integrity_summary AS
SELECT
  workspace_id,
  year_reference,
  COUNT(*) FILTER (WHERE status = 'open') AS open_issues,
  COUNT(*) FILTER (WHERE status = 'open' AND severity = 'critical') AS critical_issues,
  COUNT(*) FILTER (WHERE status = 'open' AND severity = 'warning') AS warning_issues,
  COUNT(*) FILTER (WHERE status = 'open' AND issue_type = 'drift_detected') AS drift_count,
  COUNT(*) FILTER (WHERE status = 'open' AND issue_type IN ('orphan_record','missing_reference')) AS orphan_count,
  COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_issues,
  MAX(detected_at) AS last_detected_at
FROM public.financial_integrity_issues
GROUP BY workspace_id, year_reference;
