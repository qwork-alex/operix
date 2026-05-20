
-- ============ PHASE 4: PARTICIPATION ENGINE ============

-- 1) participation_ledger
CREATE TABLE IF NOT EXISTS public.participation_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  year_reference integer,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  rule_item_id uuid REFERENCES public.profit_rule_items(id) ON DELETE SET NULL,
  participant_name text NOT NULL,
  participant_type text NOT NULL DEFAULT 'other',
  participant_user_id uuid,
  percentage numeric NOT NULL DEFAULT 0,
  expected_amount numeric NOT NULL DEFAULT 0,
  received_amount numeric NOT NULL DEFAULT 0,
  pending_amount numeric GENERATED ALWAYS AS (GREATEST(COALESCE(expected_amount,0) - COALESCE(received_amount,0), 0)) STORED,
  status text NOT NULL DEFAULT 'pending',
  last_event_hash text,
  sync_revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_participation_ledger_so_rule_name
  ON public.participation_ledger (service_order_id, COALESCE(rule_item_id, '00000000-0000-0000-0000-000000000000'::uuid), participant_name);

CREATE INDEX IF NOT EXISTS idx_pl_ws_year ON public.participation_ledger (workspace_id, year_reference);
CREATE INDEX IF NOT EXISTS idx_pl_participant_user ON public.participation_ledger (participant_user_id);
CREATE INDEX IF NOT EXISTS idx_pl_so ON public.participation_ledger (service_order_id);

ALTER TABLE public.participation_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pl_admin_all" ON public.participation_ledger
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'partner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'partner'::public.app_role));

CREATE POLICY "pl_workspace_select" ON public.participation_ledger
  FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "pl_participant_select_own" ON public.participation_ledger
  FOR SELECT TO authenticated
  USING (participant_user_id = auth.uid());

CREATE TRIGGER trg_pl_touch_updated_at
  BEFORE UPDATE ON public.participation_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Helper: resolve participant_user_id from rule context
CREATE OR REPLACE FUNCTION public.resolve_participant_user_id(_rule_id uuid, _participant_type text)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_tech_user uuid;
BEGIN
  IF _rule_id IS NULL THEN RETURN NULL; END IF;
  SELECT assigned_user_id, technician_id INTO v_rule
  FROM public.profit_rules WHERE id = _rule_id LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF lower(COALESCE(_participant_type,'')) = 'technician' THEN
    IF v_rule.technician_id IS NOT NULL THEN
      SELECT user_id INTO v_tech_user FROM public.technicians WHERE id = v_rule.technician_id LIMIT 1;
      IF v_tech_user IS NOT NULL THEN RETURN v_tech_user; END IF;
    END IF;
    RETURN v_rule.assigned_user_id;
  END IF;

  RETURN v_rule.assigned_user_id;
END;
$$;

-- 3) Core sync: recompute ledger rows for one OS
CREATE OR REPLACE FUNCTION public.sync_participation_for_so(_service_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_so RECORD;
  v_so_total numeric;
  v_received_total numeric;
  v_ratio numeric;
  v_dist RECORD;
  v_participant_type text;
  v_participant_user uuid;
  v_rule_id uuid;
  v_received numeric;
  v_status text;
  v_payload jsonb;
  v_revision bigint;
  v_hash text;
BEGIN
  SELECT id, workspace_id, year_reference, COALESCE(total,0) AS total
    INTO v_so
    FROM public.service_orders WHERE id = _service_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_so_total := COALESCE(v_so.total, 0);

  -- Sum received from billing for this OS (Phase 3 master source)
  SELECT COALESCE(SUM(fr.amount),0) INTO v_received_total
  FROM public.financial_records fr
  WHERE fr.source = 'billing'
    AND fr.type = 'revenue'
    AND fr.service_order_id = _service_order_id;

  IF v_so_total > 0 THEN
    v_ratio := LEAST(GREATEST(v_received_total / v_so_total, 0), 1);
  ELSE
    v_ratio := 0;
  END IF;

  -- Iterate distributions for this OS
  FOR v_dist IN
    SELECT sod.id, sod.rule_item_id, sod.participant_name, sod.percentage, sod.calculated_value,
           pri.participant_type AS pri_type, pri.rule_id
    FROM public.service_order_distributions sod
    LEFT JOIN public.profit_rule_items pri ON pri.id = sod.rule_item_id
    WHERE sod.service_order_id = _service_order_id
  LOOP
    v_participant_type := COALESCE(NULLIF(lower(v_dist.pri_type), ''), 'other');
    -- Skip clients defensively
    IF v_participant_type = 'client' THEN
      CONTINUE;
    END IF;

    v_rule_id := v_dist.rule_id;
    v_participant_user := public.resolve_participant_user_id(v_rule_id, v_participant_type);

    v_received := ROUND((COALESCE(v_dist.calculated_value,0) * v_ratio)::numeric, 2);

    IF v_received <= 0 THEN
      v_status := 'pending';
    ELSIF v_received >= COALESCE(v_dist.calculated_value,0) - 0.005 THEN
      v_status := 'paid';
    ELSE
      v_status := 'partial';
    END IF;

    INSERT INTO public.participation_ledger (
      workspace_id, year_reference, service_order_id, rule_item_id,
      participant_name, participant_type, participant_user_id,
      percentage, expected_amount, received_amount, status, sync_revision
    ) VALUES (
      v_so.workspace_id, v_so.year_reference, _service_order_id, v_dist.rule_item_id,
      v_dist.participant_name, v_participant_type, v_participant_user,
      COALESCE(v_dist.percentage,0), COALESCE(v_dist.calculated_value,0),
      v_received, v_status, 1
    )
    ON CONFLICT (service_order_id, COALESCE(rule_item_id, '00000000-0000-0000-0000-000000000000'::uuid), participant_name)
    DO UPDATE SET
      workspace_id = EXCLUDED.workspace_id,
      year_reference = EXCLUDED.year_reference,
      participant_type = EXCLUDED.participant_type,
      participant_user_id = EXCLUDED.participant_user_id,
      percentage = EXCLUDED.percentage,
      expected_amount = EXCLUDED.expected_amount,
      received_amount = EXCLUDED.received_amount,
      status = EXCLUDED.status,
      sync_revision = public.participation_ledger.sync_revision + 1,
      updated_at = now()
    WHERE public.participation_ledger.expected_amount IS DISTINCT FROM EXCLUDED.expected_amount
       OR public.participation_ledger.received_amount IS DISTINCT FROM EXCLUDED.received_amount
       OR public.participation_ledger.status IS DISTINCT FROM EXCLUDED.status
       OR public.participation_ledger.percentage IS DISTINCT FROM EXCLUDED.percentage
       OR public.participation_ledger.participant_user_id IS DISTINCT FROM EXCLUDED.participant_user_id;
  END LOOP;

  -- Emit idempotent event
  v_revision := 1;
  v_payload := jsonb_build_object(
    'service_order_id', _service_order_id,
    'so_total', v_so_total,
    'received_total', v_received_total,
    'ratio', v_ratio,
    'revision', v_revision
  );

  BEGIN
    PERFORM public.emit_financial_event(
      v_so.workspace_id, 'participation.updated', 'service_order',
      _service_order_id, v_payload
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;

-- 4) Fan-out: sync per invoice
CREATE OR REPLACE FUNCTION public.sync_participation_for_invoice(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_op_ids uuid[];
  v_so_ids uuid[];
  v_so uuid;
BEGIN
  SELECT * INTO v_inv FROM public.billing_invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_inv.metadata ? 'linked_payment_orders' THEN
    BEGIN
      SELECT array_agg((value)::uuid) INTO v_op_ids
      FROM jsonb_array_elements_text(v_inv.metadata->'linked_payment_orders');
    EXCEPTION WHEN OTHERS THEN v_op_ids := NULL;
    END;
  END IF;

  IF v_op_ids IS NULL OR array_length(v_op_ids,1) IS NULL THEN RETURN; END IF;

  SELECT array_agg(DISTINCT po.service_order_id) INTO v_so_ids
  FROM public.payment_orders po
  WHERE po.id = ANY(v_op_ids) AND po.service_order_id IS NOT NULL;

  IF v_so_ids IS NULL THEN RETURN; END IF;

  FOREACH v_so IN ARRAY v_so_ids LOOP
    PERFORM public.sync_participation_for_so(v_so);
  END LOOP;
END;
$$;

-- 5) Triggers

-- a) After distribution insert/update
CREATE OR REPLACE FUNCTION public.trg_participation_on_distribution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sync_participation_for_so(NEW.service_order_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_participation_on_distribution ON public.service_order_distributions;
CREATE TRIGGER trg_participation_on_distribution
  AFTER INSERT OR UPDATE ON public.service_order_distributions
  FOR EACH ROW EXECUTE FUNCTION public.trg_participation_on_distribution();

-- b) After SO total change
CREATE OR REPLACE FUNCTION public.trg_participation_on_so_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (COALESCE(OLD.total,0) IS DISTINCT FROM COALESCE(NEW.total,0)
       OR COALESCE(OLD.year_reference,0) IS DISTINCT FROM COALESCE(NEW.year_reference,0)) THEN
    PERFORM public.sync_participation_for_so(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_participation_on_so_total ON public.service_orders;
CREATE TRIGGER trg_participation_on_so_total
  AFTER UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_participation_on_so_total();

-- c) After financial_records billing change → recompute participant ledger for that SO
CREATE OR REPLACE FUNCTION public.trg_participation_on_financial_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source = 'billing' AND NEW.service_order_id IS NOT NULL THEN
    PERFORM public.sync_participation_for_so(NEW.service_order_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_participation_on_financial_billing ON public.financial_records;
CREATE TRIGGER trg_participation_on_financial_billing
  AFTER INSERT OR UPDATE ON public.financial_records
  FOR EACH ROW EXECUTE FUNCTION public.trg_participation_on_financial_billing();

-- 6) Aggregated view
CREATE OR REPLACE VIEW public.v_participation_summary
WITH (security_invoker = on) AS
SELECT
  pl.workspace_id,
  pl.year_reference,
  pl.participant_name,
  pl.participant_type,
  pl.participant_user_id,
  SUM(pl.expected_amount)::numeric AS expected,
  SUM(pl.received_amount)::numeric AS received,
  SUM(pl.pending_amount)::numeric  AS pending,
  COUNT(*) FILTER (WHERE pl.status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE pl.status = 'partial') AS partial_count,
  COUNT(*) FILTER (WHERE pl.status = 'paid')    AS paid_count,
  COUNT(DISTINCT pl.service_order_id)           AS os_count
FROM public.participation_ledger pl
GROUP BY pl.workspace_id, pl.year_reference, pl.participant_name, pl.participant_type, pl.participant_user_id;

-- 7) Backfill existing data
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT service_order_id FROM public.service_order_distributions LOOP
    BEGIN
      PERFORM public.sync_participation_for_so(r.service_order_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
