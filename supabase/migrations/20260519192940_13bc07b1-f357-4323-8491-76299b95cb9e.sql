
-- 1. Add metadata column to billing_invoices for linked lists / OPs (incremental, no breaking change)
ALTER TABLE public.billing_invoices
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_billing_invoices_metadata_gin
  ON public.billing_invoices USING gin (metadata);

-- 2. Auto status engine: when paid_amount or total_amount changes, recompute status
-- Preserves 'draft' and 'cancelled' (manual states); only transitions pending<->partial<->paid
CREATE OR REPLACE FUNCTION public.billing_invoices_autostatus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid numeric := COALESCE(NEW.paid_amount, 0);
  v_total numeric := COALESCE(NEW.total_amount, 0);
BEGIN
  -- Skip if user explicitly set a manual terminal state
  IF NEW.status IN ('draft', 'cancelled') THEN
    RETURN NEW;
  END IF;

  IF v_total <= 0 THEN
    -- avoid noise on empty invoices
    RETURN NEW;
  END IF;

  IF v_paid <= 0 THEN
    NEW.status := 'pending';
  ELSIF v_paid >= v_total THEN
    NEW.status := 'paid';
  ELSE
    NEW.status := 'partial';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_invoices_autostatus ON public.billing_invoices;
CREATE TRIGGER trg_billing_invoices_autostatus
BEFORE INSERT OR UPDATE OF paid_amount, total_amount, status
ON public.billing_invoices
FOR EACH ROW EXECUTE FUNCTION public.billing_invoices_autostatus();

-- 3. Propagation: when invoice.status changes, sync linked payment_orders
-- Only acts if metadata.linked_payment_orders is a non-empty array
CREATE OR REPLACE FUNCTION public.billing_invoices_propagate_status()
RETURNS TRIGGER
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

  -- Map billing status -> payment_order status (existing PO statuses: pending, partial, paid, etc.)
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_invoices_propagate_status ON public.billing_invoices;
CREATE TRIGGER trg_billing_invoices_propagate_status
AFTER UPDATE OF status ON public.billing_invoices
FOR EACH ROW EXECUTE FUNCTION public.billing_invoices_propagate_status();
