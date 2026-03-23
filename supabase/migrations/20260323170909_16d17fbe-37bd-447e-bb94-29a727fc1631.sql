-- Auto-link payment orders to service orders (plate + client + platform)
CREATE OR REPLACE FUNCTION public.link_payment_order_to_service_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.service_order_id IS NULL THEN
    SELECT so.id
    INTO NEW.service_order_id
    FROM public.service_orders so
    WHERE so.license_plate IS NOT DISTINCT FROM NEW.license_plate
      AND so.client_id IS NOT DISTINCT FROM NEW.client_id
      AND so.platform IS NOT DISTINCT FROM NEW.platform
    ORDER BY so.created_at DESC
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_payment_order_to_service_order ON public.payment_orders;
CREATE TRIGGER trg_link_payment_order_to_service_order
BEFORE INSERT OR UPDATE ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.link_payment_order_to_service_order();

-- Financial sync from service/payment orders
CREATE OR REPLACE FUNCTION public.sync_financial_records_from_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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
    WHERE source = 'service_orders'
      AND type = 'revenue'
      AND service_order_id = NEW.id;

    IF NOT FOUND THEN
      INSERT INTO public.financial_records(
        created_by, type, source, amount, status, notes, reference_id, service_order_id
      ) VALUES (
        NEW.created_by, 'revenue', 'service_orders', COALESCE(NEW.total, 0),
        COALESCE(NEW.status, 'pending'), 'Auto-synced expected revenue from service order', NEW.id, NEW.id
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'payment_orders' THEN
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
        created_by, type, source, amount, status, notes, reference_id, payment_order_id
      ) VALUES (
        NEW.created_by, 'revenue', 'payment_orders', COALESCE(NEW.total, 0),
        COALESCE(NEW.status, 'pending'), 'Auto-synced real revenue from payment order', NEW.id, NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_financial_from_service_orders ON public.service_orders;
CREATE TRIGGER trg_sync_financial_from_service_orders
AFTER INSERT OR UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_financial_records_from_orders();

DROP TRIGGER IF EXISTS trg_sync_financial_from_payment_orders ON public.payment_orders;
CREATE TRIGGER trg_sync_financial_from_payment_orders
AFTER INSERT OR UPDATE ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_financial_records_from_orders();

-- Discrepancy auto-engine
CREATE OR REPLACE FUNCTION public.sync_discrepancy_for_service_order(_service_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  so_total numeric;
  po_id uuid;
  po_total numeric;
BEGIN
  SELECT total INTO so_total
  FROM public.service_orders
  WHERE id = _service_order_id;

  IF so_total IS NULL THEN
    RETURN;
  END IF;

  SELECT id, total INTO po_id, po_total
  FROM public.payment_orders
  WHERE service_order_id = _service_order_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF po_id IS NULL THEN
    UPDATE public.discrepancies
    SET expected_value = so_total,
        received_value = 0,
        payment_order_id = NULL,
        resolved = false,
        resolved_at = NULL,
        issue_type = 'missing'
    WHERE service_order_id = _service_order_id
      AND issue_type IN ('missing','mismatch');

    IF NOT FOUND THEN
      INSERT INTO public.discrepancies(
        service_order_id, payment_order_id, issue_type, expected_value, received_value, resolved
      ) VALUES (
        _service_order_id, NULL, 'missing', so_total, 0, false
      );
    END IF;
    RETURN;
  END IF;

  IF COALESCE(so_total,0) <> COALESCE(po_total,0) THEN
    UPDATE public.discrepancies
    SET expected_value = so_total,
        received_value = po_total,
        payment_order_id = po_id,
        resolved = false,
        resolved_at = NULL,
        issue_type = 'mismatch'
    WHERE service_order_id = _service_order_id
      AND issue_type IN ('missing','mismatch');

    IF NOT FOUND THEN
      INSERT INTO public.discrepancies(
        service_order_id, payment_order_id, issue_type, expected_value, received_value, resolved
      ) VALUES (
        _service_order_id, po_id, 'mismatch', so_total, po_total, false
      );
    END IF;
  ELSE
    UPDATE public.discrepancies
    SET resolved = true,
        resolved_at = now(),
        payment_order_id = po_id,
        expected_value = so_total,
        received_value = po_total
    WHERE service_order_id = _service_order_id
      AND issue_type IN ('missing','mismatch');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_discrepancy_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'service_orders' THEN
    PERFORM public.sync_discrepancy_for_service_order(NEW.id);
  ELSIF TG_TABLE_NAME = 'payment_orders' AND NEW.service_order_id IS NOT NULL THEN
    PERFORM public.sync_discrepancy_for_service_order(NEW.service_order_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_discrepancy_from_service_orders ON public.service_orders;
CREATE TRIGGER trg_sync_discrepancy_from_service_orders
AFTER INSERT OR UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.run_discrepancy_sync_trigger();

DROP TRIGGER IF EXISTS trg_sync_discrepancy_from_payment_orders ON public.payment_orders;
CREATE TRIGGER trg_sync_discrepancy_from_payment_orders
AFTER INSERT OR UPDATE ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.run_discrepancy_sync_trigger();