
-- Phase 4.5 — Financial Observability & Audit Layer (read-only)

CREATE TABLE IF NOT EXISTS public.participation_diffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  year_reference int,
  ledger_id uuid,
  service_order_id uuid,
  participant_name text,
  participant_type text,
  previous_expected numeric,
  new_expected numeric,
  previous_received numeric,
  new_received numeric,
  previous_status text,
  new_status text,
  event_hash text,
  sync_revision bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participation_diffs_ws_created
  ON public.participation_diffs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_participation_diffs_ledger
  ON public.participation_diffs(ledger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_participation_diffs_so
  ON public.participation_diffs(service_order_id);

ALTER TABLE public.participation_diffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pd_select_workspace ON public.participation_diffs;
CREATE POLICY pd_select_workspace ON public.participation_diffs
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL
    OR public.is_workspace_member(auth.uid(), workspace_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE OR REPLACE FUNCTION public.capture_participation_diff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_expected numeric := 0;
  v_prev_received numeric := 0;
  v_prev_status   text    := 'pending';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_prev_expected := COALESCE(OLD.expected_amount, 0);
    v_prev_received := COALESCE(OLD.received_amount, 0);
    v_prev_status   := COALESCE(OLD.status, 'pending');

    IF v_prev_expected = COALESCE(NEW.expected_amount,0)
       AND v_prev_received = COALESCE(NEW.received_amount,0)
       AND v_prev_status   = COALESCE(NEW.status, 'pending') THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.participation_diffs(
    workspace_id, year_reference, ledger_id, service_order_id,
    participant_name, participant_type,
    previous_expected, new_expected,
    previous_received, new_received,
    previous_status, new_status,
    event_hash, sync_revision
  ) VALUES (
    NEW.workspace_id, NEW.year_reference, NEW.id, NEW.service_order_id,
    NEW.participant_name, NEW.participant_type,
    v_prev_expected, COALESCE(NEW.expected_amount,0),
    v_prev_received, COALESCE(NEW.received_amount,0),
    v_prev_status, COALESCE(NEW.status,'pending'),
    NEW.last_event_hash, NEW.sync_revision
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_participation_diff ON public.participation_ledger;
CREATE TRIGGER trg_participation_diff
  AFTER INSERT OR UPDATE ON public.participation_ledger
  FOR EACH ROW EXECUTE FUNCTION public.capture_participation_diff();

CREATE OR REPLACE VIEW public.financial_event_timeline_v
WITH (security_invoker = true)
AS
SELECT
  fe.id,
  fe.workspace_id,
  (fe.payload->>'year_reference')::int       AS year_reference,
  fe.entity_type,
  fe.entity_id,
  fe.event_type,
  fe.event_hash,
  fe.event_revision                          AS revision,
  fe.created_by_trigger                      AS source,
  fe.correlation_id,
  fe.caused_by_event_id,
  fe.actor_user_id,
  jsonb_build_object(
    'amount',           fe.payload->'amount',
    'received',         fe.payload->'received',
    'expected',         fe.payload->'expected',
    'status',           fe.payload->'status',
    'reason',           fe.payload->'reason',
    'participant',      fe.payload->'participant_name',
    'service_order_id', fe.payload->'service_order_id',
    'invoice_id',       fe.payload->'invoice_id'
  )                                          AS payload_summary,
  fe.payload                                 AS payload,
  fe.created_at
FROM public.financial_events fe;

CREATE OR REPLACE VIEW public.v_financial_integrity_summary
WITH (security_invoker = true)
AS
WITH
  dup_hashes AS (
    SELECT workspace_id, COUNT(*) FILTER (WHERE c > 1) AS duplicate_hash_count
    FROM (
      SELECT workspace_id, event_hash, COUNT(*) AS c
      FROM public.financial_events
      WHERE event_hash IS NOT NULL
      GROUP BY workspace_id, event_hash
    ) x
    GROUP BY workspace_id
  ),
  orphan_op AS (
    SELECT po.workspace_id, COUNT(*) AS orphan_op_count
    FROM public.payment_orders po
    LEFT JOIN public.service_orders so ON so.id = po.service_order_id
    WHERE po.service_order_id IS NULL OR so.id IS NULL
    GROUP BY po.workspace_id
  ),
  missing_so_links AS (
    SELECT fr.workspace_id, COUNT(*) AS missing_so_links
    FROM public.financial_records fr
    WHERE fr.service_order_id IS NULL AND fr.source = 'billing'
    GROUP BY fr.workspace_id
  ),
  over_alloc AS (
    SELECT so.workspace_id, sod.service_order_id, SUM(COALESCE(sod.percentage, 0)) AS pct_sum
    FROM public.service_order_distributions sod
    JOIN public.service_orders so ON so.id = sod.service_order_id
    GROUP BY so.workspace_id, sod.service_order_id
  ),
  over_alloc_agg AS (
    SELECT workspace_id, COUNT(*) AS over_allocated_distributions
    FROM over_alloc WHERE pct_sum > 100.5
    GROUP BY workspace_id
  ),
  replay_collapses AS (
    SELECT workspace_id, COUNT(*) AS replay_collapses
    FROM public.financial_events
    WHERE event_type ILIKE '%replay%' OR payload ? 'replay'
    GROUP BY workspace_id
  ),
  sync_lock_hits AS (
    SELECT workspace_id, COUNT(*) FILTER (WHERE financial_sync_lock IS TRUE) AS financial_sync_lock_hits
    FROM public.billing_invoices
    GROUP BY workspace_id
  ),
  skipped_diff AS (
    SELECT workspace_id, COUNT(*) AS skipped_diff_updates
    FROM public.financial_events
    WHERE event_type = 'financial.sync.skipped'
       OR payload->>'reason' = 'no_diff'
    GROUP BY workspace_id
  ),
  invalid_total AS (
    SELECT
      (SELECT COUNT(*) FROM public.financial_records WHERE workspace_id IS NULL)
    + (SELECT COUNT(*) FROM public.billing_invoices  WHERE workspace_id IS NULL)
    AS n
  ),
  all_ws AS (
    SELECT DISTINCT workspace_id FROM public.financial_events  WHERE workspace_id IS NOT NULL
    UNION
    SELECT DISTINCT workspace_id FROM public.billing_invoices   WHERE workspace_id IS NOT NULL
    UNION
    SELECT DISTINCT workspace_id FROM public.financial_records  WHERE workspace_id IS NOT NULL
  )
SELECT
  w.workspace_id,
  COALESCE(d.duplicate_hash_count, 0)         AS duplicate_hash_count,
  COALESCE(o.orphan_op_count, 0)              AS orphan_op_count,
  COALESCE(m.missing_so_links, 0)             AS missing_so_links,
  COALESCE(oa.over_allocated_distributions,0) AS over_allocated_distributions,
  (SELECT n FROM invalid_total)               AS invalid_workspace_rows,
  COALESCE(r.replay_collapses, 0)             AS replay_collapses,
  COALESCE(s.skipped_diff_updates, 0)         AS skipped_diff_updates,
  COALESCE(l.financial_sync_lock_hits, 0)     AS financial_sync_lock_hits
FROM all_ws w
LEFT JOIN dup_hashes      d  ON d.workspace_id  = w.workspace_id
LEFT JOIN orphan_op       o  ON o.workspace_id  = w.workspace_id
LEFT JOIN missing_so_links m ON m.workspace_id  = w.workspace_id
LEFT JOIN over_alloc_agg  oa ON oa.workspace_id = w.workspace_id
LEFT JOIN replay_collapses r ON r.workspace_id  = w.workspace_id
LEFT JOIN skipped_diff    s  ON s.workspace_id  = w.workspace_id
LEFT JOIN sync_lock_hits  l  ON l.workspace_id  = w.workspace_id;

COMMENT ON VIEW public.financial_event_timeline_v IS 'Phase 4.5: read-only chronological audit timeline of all financial events.';
COMMENT ON VIEW public.v_financial_integrity_summary IS 'Phase 4.5: per-workspace integrity KPIs (read-only).';
COMMENT ON TABLE public.participation_diffs IS 'Phase 4.5: captures before/after deltas per participation_ledger change. SECURITY DEFINER trigger writes; no user mutation.';
