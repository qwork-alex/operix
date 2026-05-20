
-- ============================================================
-- PHASE 3B — FINANCIAL HARDENING (idempotency + locks + replay)
-- ============================================================

-- 1. financial_events: dedup + lineage columns
ALTER TABLE public.financial_events
  ADD COLUMN IF NOT EXISTS event_hash text,
  ADD COLUMN IF NOT EXISTS event_revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS caused_by_event_id uuid,
  ADD COLUMN IF NOT EXISTS processing_key text,
  ADD COLUMN IF NOT EXISTS created_by_trigger text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_events_event_hash
  ON public.financial_events(event_hash)
  WHERE event_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_events_correlation
  ON public.financial_events(correlation_id) WHERE correlation_id IS NOT NULL;

-- 2. billing_invoices: sync state columns
ALTER TABLE public.billing_invoices
  ADD COLUMN IF NOT EXISTS sync_revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_financial_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_financial_event_hash text,
  ADD COLUMN IF NOT EXISTS financial_sync_lock boolean NOT NULL DEFAULT false;

-- 3. Deterministic event hash helper
CREATE OR REPLACE FUNCTION public.deterministic_event_hash(
  _ws uuid, _entity_type text, _entity_id uuid,
  _event_type text, _revision bigint, _payload jsonb
) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT encode(
    digest(
      coalesce(_ws::text,'') || '|' ||
      coalesce(_entity_type,'') || '|' ||
      coalesce(_entity_id::text,'') || '|' ||
      coalesce(_event_type,'') || '|' ||
      coalesce(_revision::text,'1') || '|' ||
      coalesce(_payload::text,'{}'),
      'sha256'
    ),
    'hex'
  );
$$;

-- 4. emit_financial_event with hash dedup
CREATE OR REPLACE FUNCTION public.emit_financial_event(
  _workspace_id uuid, _event_type text, _entity_type text,
  _entity_id uuid, _payload jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_revision bigint := 1;
  v_hash text;
BEGIN
  -- derive revision from payload if present
  IF _payload ? 'revision' THEN
    BEGIN v_revision := (_payload->>'revision')::bigint; EXCEPTION WHEN OTHERS THEN v_revision := 1; END;
  END IF;

  v_hash := public.deterministic_event_hash(
    _workspace_id, _entity_type, _entity_id, _event_type, v_revision, _payload
  );

  INSERT INTO public.financial_events(
    workspace_id, event_type, entity_type, entity_id, payload, actor_user_id,
    event_hash, event_revision, created_by_trigger
  ) VALUES (
    _workspace_id, _event_type, _entity_type, _entity_id, COALESCE(_payload,'{}'::jsonb), auth.uid(),
    v_hash, v_revision, TG_NAME
  )
  ON CONFLICT (event_hash) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- 5. payment_order_has_active_billing
CREATE OR REPLACE FUNCTION public.payment_order_has_active_billing(_op_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.billing_invoices bi
    WHERE bi.status <> 'cancelled'
      AND bi.metadata ? 'linked_payment_orders'
      AND bi.metadata->'linked_payment_orders' @> to_jsonb(_op_id::text)
  );
$$;

-- 6. Harden sync_financial_records_from_orders (use active-billing gate)
CREATE OR REPLACE FUNCTION public.sync_financial_records_from_orders()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'service_orders' THEN
    UPDATE public.financial_records
    SET amount = COALESCE(NEW.total, 0),
        status = COALESCE(NEW.status, 'pending'),
        service_order_id = NEW.id,
        reference_id = NEW.id,
        created_by = COALESCE(public.financial_records.created_by, NEW.created_by),
        notes = 'Auto-synced expected revenue from service order'
    WHERE source = 'service_orders' AND type = 'revenue' AND service_order_id = NEW.id;

    IF NOT FOUND THEN
      INSERT INTO public.financial_records(
        created_by, type, source, amount, status, notes, reference_id, service_order_id,
        user_id, assigned_user_id, workspace_id
      ) VALUES (
        NEW.created_by, 'revenue', 'service_orders', COALESCE(NEW.total, 0),
        COALESCE(NEW.status, 'pending'), 'Auto-synced expected revenue from service order', NEW.id, NEW.id,
        COALESCE(NEW.user_id, NEW.created_by),
        COALESCE(NEW.assigned_user_id, NEW.user_id, NEW.created_by),
        NEW.workspace_id
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'payment_orders' THEN
    -- Stronger block: any active (non-cancelled) invoice claims this OP
    IF public.payment_order_has_active_billing(NEW.id) THEN
      RETURN NEW;
    END IF;

    UPDATE public.financial_records
    SET amount = COALESCE(NEW.total, 0),
        status = COALESCE(NEW.status, 'pending'),
        payment_order_id = NEW.id,
        reference_id = NEW.id,
        created_by = COALESCE(public.financial_records.created_by, NEW.created_by),
        notes = 'Auto-synced real revenue from payment order'
    WHERE source = 'payment_orders' AND type = 'revenue' AND payment_order_id = NEW.id;

    IF NOT FOUND THEN
      INSERT INTO public.financial_records(
        created_by, type, source, amount, status, notes, reference_id, payment_order_id,
        user_id, assigned_user_id, workspace_id
      ) VALUES (
        NEW.created_by, 'revenue', 'payment_orders', COALESCE(NEW.total, 0),
        COALESCE(NEW.status, 'pending'), 'Auto-synced real revenue from payment order', NEW.id, NEW.id,
        COALESCE(NEW.user_id, NEW.created_by),
        COALESCE(NEW.assigned_user_id, NEW.user_id, NEW.created_by),
        NEW.workspace_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 7. sync_financial_received_from_billing — state-derived + diff-skip + integrity check
CREATE OR REPLACE FUNCTION public.sync_financial_received_from_billing(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_op_ids uuid[];
  v_op_id uuid;
  v_op_total numeric;
  v_received numeric;
  v_sum_op_totals numeric := 0;
  v_op RECORD;
  v_old_amount numeric;
  v_total_received numeric := 0;
  v_correlation uuid := gen_random_uuid();
BEGIN
  SELECT * INTO v_inv FROM public.billing_invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_inv.metadata ? 'linked_payment_orders' THEN
    BEGIN
      SELECT array_agg((value)::uuid) INTO v_op_ids
        FROM jsonb_array_elements_text(v_inv.metadata->'linked_payment_orders');
    EXCEPTION WHEN OTHERS THEN v_op_ids := NULL;
    END;
  END IF;

  IF v_op_ids IS NULL OR array_length(v_op_ids,1) IS NULL THEN
    PERFORM public.emit_financial_event(
      v_inv.workspace_id, 'invoice.payment.updated', 'billing_invoice', v_inv.id,
      jsonb_build_object(
        'paid_amount', v_inv.paid_amount,
        'total_amount', v_inv.total_amount,
        'status', v_inv.status,
        'revision', v_inv.sync_revision,
        'correlation_id', v_correlation
      )
    );
    RETURN;
  END IF;

  SELECT COALESCE(SUM(COALESCE(total,0)),0) INTO v_sum_op_totals
  FROM public.payment_orders WHERE id = ANY(v_op_ids);

  FOREACH v_op_id IN ARRAY v_op_ids LOOP
    SELECT * INTO v_op FROM public.payment_orders WHERE id = v_op_id;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_op_total := COALESCE(v_op.total, 0);

    -- State-derived (never delta)
    IF v_sum_op_totals > 0 THEN
      v_received := ROUND((COALESCE(v_inv.paid_amount,0) * v_op_total / v_sum_op_totals)::numeric, 2);
    ELSE
      v_received := 0;
    END IF;

    v_total_received := v_total_received + v_received;

    -- Integrity: never exceed OP.total
    IF v_received > v_op_total AND v_op_total > 0 THEN
      PERFORM public.emit_financial_event(
        v_inv.workspace_id, 'financial.integrity.warning', 'payment_order', v_op.id,
        jsonb_build_object('reason','received_exceeds_op_total','received',v_received,'op_total',v_op_total,'invoice_id',v_inv.id)
      );
    END IF;

    SELECT amount INTO v_old_amount
      FROM public.financial_records
     WHERE source='billing' AND type='revenue' AND payment_order_id = v_op.id
     LIMIT 1;

    IF v_old_amount IS NOT NULL
       AND v_old_amount = v_received
       AND EXISTS (
         SELECT 1 FROM public.financial_records
         WHERE source='billing' AND type='revenue' AND payment_order_id = v_op.id
           AND status = v_inv.status::text
       )
    THEN
      CONTINUE;  -- nothing changed, skip write & invalidation
    END IF;

    UPDATE public.financial_records
       SET amount = v_received,
           status = v_inv.status::text,
           payment_order_id = v_op.id,
           reference_id = v_inv.id,
           notes = 'Auto-synced from billing invoice ' || v_inv.invoice_number,
           updated_at = now()
     WHERE source='billing' AND type='revenue' AND payment_order_id = v_op.id;

    IF NOT FOUND THEN
      INSERT INTO public.financial_records(
        created_by, type, source, amount, status, notes,
        reference_id, payment_order_id, service_order_id,
        user_id, assigned_user_id, workspace_id
      ) VALUES (
        COALESCE(v_inv.created_by, v_op.created_by),
        'revenue','billing', v_received, v_inv.status::text,
        'Auto-synced from billing invoice ' || v_inv.invoice_number,
        v_inv.id, v_op.id, v_op.service_order_id,
        COALESCE(v_op.user_id, v_op.created_by),
        COALESCE(v_op.assigned_user_id, v_op.user_id, v_op.created_by),
        v_inv.workspace_id
      );
    END IF;
  END LOOP;

  -- Integrity: invoice total
  IF v_total_received > COALESCE(v_inv.total_amount,0) AND v_inv.total_amount > 0 THEN
    PERFORM public.emit_financial_event(
      v_inv.workspace_id,'financial.integrity.warning','billing_invoice', v_inv.id,
      jsonb_build_object('reason','total_received_exceeds_invoice_total','total_received',v_total_received,'invoice_total',v_inv.total_amount)
    );
  END IF;

  UPDATE public.billing_invoices
     SET last_financial_sync_at = now()
   WHERE id = v_inv.id;

  PERFORM public.emit_financial_event(
    v_inv.workspace_id, 'financial.received.updated', 'billing_invoice', v_inv.id,
    jsonb_build_object(
      'paid_amount', v_inv.paid_amount, 'total_amount', v_inv.total_amount,
      'status', v_inv.status, 'linked_ops', to_jsonb(v_op_ids),
      'revision', v_inv.sync_revision, 'correlation_id', v_correlation
    )
  );
END;
$$;

-- 8. Reentrancy-guarded trigger
CREATE OR REPLACE FUNCTION public.trg_billing_sync_financial()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lock boolean;
BEGIN
  -- skip if nothing financial changed
  IF TG_OP = 'UPDATE'
     AND NEW.paid_amount IS NOT DISTINCT FROM OLD.paid_amount
     AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata THEN
    RETURN NEW;
  END IF;

  -- reentrancy guard
  SELECT financial_sync_lock INTO v_lock FROM public.billing_invoices WHERE id = NEW.id;
  IF COALESCE(v_lock,false) THEN
    RETURN NEW;
  END IF;

  UPDATE public.billing_invoices
     SET financial_sync_lock = true,
         sync_revision = COALESCE(sync_revision,1) + 1
   WHERE id = NEW.id;

  BEGIN
    PERFORM public.sync_financial_received_from_billing(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.billing_invoices SET financial_sync_lock = false WHERE id = NEW.id;
    RAISE;
  END;

  UPDATE public.billing_invoices SET financial_sync_lock = false WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- 9. financial_state_snapshots
CREATE TABLE IF NOT EXISTS public.financial_state_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fss_entity ON public.financial_state_snapshots(entity_type, entity_id, revision DESC);
CREATE INDEX IF NOT EXISTS idx_fss_ws ON public.financial_state_snapshots(workspace_id, created_at DESC);

ALTER TABLE public.financial_state_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fss_select_workspace ON public.financial_state_snapshots;
CREATE POLICY fss_select_workspace ON public.financial_state_snapshots
  FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR public.is_workspace_member(auth.uid(), workspace_id) OR public.has_role(auth.uid(),'admin'::app_role));

-- 10. replay_financial_state (infra only)
CREATE OR REPLACE FUNCTION public.replay_financial_state(_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_op_ids uuid[];
  v_ops jsonb;
  v_events jsonb;
  v_snapshots jsonb;
BEGIN
  SELECT * INTO v_inv FROM public.billing_invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','invoice_not_found'); END IF;

  IF v_inv.metadata ? 'linked_payment_orders' THEN
    BEGIN
      SELECT array_agg((value)::uuid) INTO v_op_ids
        FROM jsonb_array_elements_text(v_inv.metadata->'linked_payment_orders');
    EXCEPTION WHEN OTHERS THEN v_op_ids := NULL;
    END;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(po.*)),'[]'::jsonb) INTO v_ops
    FROM public.payment_orders po
    WHERE v_op_ids IS NOT NULL AND po.id = ANY(v_op_ids);

  SELECT COALESCE(jsonb_agg(to_jsonb(fe.*) ORDER BY fe.created_at), '[]'::jsonb) INTO v_events
    FROM public.financial_events fe
    WHERE fe.entity_id = _invoice_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(s.*) ORDER BY s.created_at), '[]'::jsonb) INTO v_snapshots
    FROM public.financial_state_snapshots s
    WHERE s.entity_id = _invoice_id;

  RETURN jsonb_build_object(
    'invoice', to_jsonb(v_inv),
    'linked_payment_orders', v_ops,
    'events', v_events,
    'snapshots', v_snapshots
  );
END;
$$;
