
-- =====================================================
-- Phase 3 — Billing as Financial Master Authority
-- Additive, non-destructive.
-- =====================================================

-- 1a. Financial events log
CREATE TABLE IF NOT EXISTS public.financial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_events_ws ON public.financial_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_events_entity ON public.financial_events(entity_type, entity_id);

ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fe_select_workspace ON public.financial_events;
CREATE POLICY fe_select_workspace ON public.financial_events
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL
    OR public.is_workspace_member(auth.uid(), workspace_id)
    OR public.has_role(auth.uid(), 'admin')
  );

-- No direct INSERT/UPDATE/DELETE policy: writes only via security definer functions.

-- 1b. Emit event helper
CREATE OR REPLACE FUNCTION public.emit_financial_event(
  _workspace_id uuid,
  _event_type text,
  _entity_type text,
  _entity_id uuid,
  _payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.financial_events(workspace_id, event_type, entity_type, entity_id, payload, actor_user_id)
  VALUES (_workspace_id, _event_type, _entity_type, _entity_id, COALESCE(_payload, '{}'::jsonb), auth.uid());
EXCEPTION WHEN OTHERS THEN
  -- never block main flow on logging
  NULL;
END;
$$;

-- 1d. Sync financial "received" from billing invoice
CREATE OR REPLACE FUNCTION public.sync_financial_received_from_billing(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_op_ids uuid[];
  v_op_id uuid;
  v_op_total numeric;
  v_received numeric;
  v_sum_op_totals numeric := 0;
  v_op RECORD;
BEGIN
  SELECT * INTO v_inv FROM public.billing_invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- collect linked OPs from metadata.linked_payment_orders[]
  IF v_inv.metadata ? 'linked_payment_orders' THEN
    BEGIN
      SELECT array_agg((value)::uuid) INTO v_op_ids
        FROM jsonb_array_elements_text(v_inv.metadata->'linked_payment_orders');
    EXCEPTION WHEN OTHERS THEN
      v_op_ids := NULL;
    END;
  END IF;

  -- if no linked OPs, just emit event and exit
  IF v_op_ids IS NULL OR array_length(v_op_ids,1) IS NULL THEN
    PERFORM public.emit_financial_event(
      v_inv.workspace_id, 'invoice.payment.updated', 'billing_invoice', v_inv.id,
      jsonb_build_object('paid_amount', v_inv.paid_amount, 'total_amount', v_inv.total_amount, 'status', v_inv.status)
    );
    RETURN;
  END IF;

  -- compute sum of OP totals for proportional distribution
  SELECT COALESCE(SUM(COALESCE(total,0)),0) INTO v_sum_op_totals
  FROM public.payment_orders WHERE id = ANY(v_op_ids);

  FOREACH v_op_id IN ARRAY v_op_ids LOOP
    SELECT * INTO v_op FROM public.payment_orders WHERE id = v_op_id;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_op_total := COALESCE(v_op.total, 0);

    -- proportional received based on invoice paid_amount
    IF v_sum_op_totals > 0 AND v_inv.total_amount > 0 THEN
      v_received := ROUND( (COALESCE(v_inv.paid_amount,0) * v_op_total / v_sum_op_totals)::numeric, 2);
    ELSE
      v_received := 0;
    END IF;

    -- UPSERT financial_records source='billing' for this OP
    UPDATE public.financial_records
       SET amount = v_received,
           status = v_inv.status::text,
           payment_order_id = v_op.id,
           reference_id = v_inv.id,
           notes = 'Auto-synced from billing invoice ' || v_inv.invoice_number,
           updated_at = now()
     WHERE source = 'billing'
       AND type = 'revenue'
       AND payment_order_id = v_op.id;

    IF NOT FOUND THEN
      INSERT INTO public.financial_records(
        created_by, type, source, amount, status, notes,
        reference_id, payment_order_id, service_order_id,
        user_id, assigned_user_id, workspace_id
      ) VALUES (
        COALESCE(v_inv.created_by, v_op.created_by),
        'revenue', 'billing', v_received, v_inv.status::text,
        'Auto-synced from billing invoice ' || v_inv.invoice_number,
        v_inv.id, v_op.id, v_op.service_order_id,
        COALESCE(v_op.user_id, v_op.created_by),
        COALESCE(v_op.assigned_user_id, v_op.user_id, v_op.created_by),
        v_inv.workspace_id
      );
    END IF;
  END LOOP;

  PERFORM public.emit_financial_event(
    v_inv.workspace_id, 'financial.received.updated', 'billing_invoice', v_inv.id,
    jsonb_build_object('paid_amount', v_inv.paid_amount, 'total_amount', v_inv.total_amount, 'status', v_inv.status, 'linked_ops', to_jsonb(v_op_ids))
  );
END;
$$;

-- 1e. Trigger on billing_invoices that syncs financial after changes
CREATE OR REPLACE FUNCTION public.trg_billing_sync_financial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_financial_event(
      NEW.workspace_id, 'invoice.created', 'billing_invoice', NEW.id,
      jsonb_build_object('total_amount', NEW.total_amount, 'paid_amount', NEW.paid_amount, 'status', NEW.status)
    );
    PERFORM public.sync_financial_received_from_billing(NEW.id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.metadata IS DISTINCT FROM OLD.metadata THEN
      PERFORM public.emit_financial_event(
        NEW.workspace_id, 'invoice.updated', 'billing_invoice', NEW.id,
        jsonb_build_object(
          'old', jsonb_build_object('paid', OLD.paid_amount, 'total', OLD.total_amount, 'status', OLD.status),
          'new', jsonb_build_object('paid', NEW.paid_amount, 'total', NEW.total_amount, 'status', NEW.status)
        )
      );
      PERFORM public.sync_financial_received_from_billing(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_invoices_sync_financial ON public.billing_invoices;
CREATE TRIGGER billing_invoices_sync_financial
  AFTER INSERT OR UPDATE ON public.billing_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_billing_sync_financial();

-- 1c. Augment propagation function to emit events (keep behavior)
CREATE OR REPLACE FUNCTION public.billing_invoices_propagate_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_new_status text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  PERFORM public.emit_financial_event(
    NEW.workspace_id, 'invoice.status.updated', 'billing_invoice', NEW.id,
    jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
  );

  IF NEW.metadata IS NULL OR NOT (NEW.metadata ? 'linked_payment_orders') THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT array_agg((value)::uuid)
      INTO v_ids
      FROM jsonb_array_elements_text(NEW.metadata->'linked_payment_orders');
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  v_new_status := CASE NEW.status
    WHEN 'paid'    THEN 'paid'
    WHEN 'partial' THEN 'partial'
    WHEN 'pending' THEN 'pending'
    ELSE NULL
  END;

  IF v_new_status IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.payment_orders
    SET status = v_new_status,
        updated_at = now()
  WHERE id = ANY(v_ids)
    AND status IS DISTINCT FROM v_new_status;

  PERFORM public.emit_financial_event(
    NEW.workspace_id, 'op.status.synced', 'billing_invoice', NEW.id,
    jsonb_build_object('linked_ops', to_jsonb(v_ids), 'new_status', v_new_status)
  );

  RETURN NEW;
END;
$$;

-- 1f. Helper: does an OP already have a billing invoice covering it?
CREATE OR REPLACE FUNCTION public.payment_order_has_invoice(_op_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.billing_invoices bi
    WHERE bi.metadata ? 'linked_payment_orders'
      AND bi.metadata->'linked_payment_orders' @> to_jsonb(_op_id::text)
  );
$$;

-- Update sync_financial_records_from_orders to skip PO->Financial when invoice exists
CREATE OR REPLACE FUNCTION public.sync_financial_records_from_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'service_orders' THEN
    -- Expected revenue (unchanged)
    UPDATE public.financial_records
    SET amount = COALESCE(NEW.total, 0),
        status = COALESCE(NEW.status, 'pending'),
        service_order_id = NEW.id,
        reference_id = NEW.id,
        created_by = COALESCE(public.financial_records.created_by, NEW.created_by),
        notes = 'Auto-synced expected revenue from service order'
    WHERE source = 'service_orders'
      AND type = 'revenue'
      AND service_order_id = NEW.id;

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
    -- Skip if Billing already manages this OP
    IF public.payment_order_has_invoice(NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Legacy fallback: OP without invoice keeps old behavior
    UPDATE public.financial_records
    SET amount = COALESCE(NEW.total, 0),
        status = COALESCE(NEW.status, 'pending'),
        payment_order_id = NEW.id,
        reference_id = NEW.id,
        created_by = COALESCE(public.financial_records.created_by, NEW.created_by),
        notes = 'Auto-synced real revenue from payment order'
    WHERE source = 'payment_orders'
      AND type = 'revenue'
      AND payment_order_id = NEW.id;

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
