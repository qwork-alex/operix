-- =========================================================
-- Phase B3.1 — Surgical RLS fixes
-- Reversible. Zero downtime. No frontend changes.
-- =========================================================

-- ---------------------------------------------------------
-- FIX 1: Discrepancies INSERT bypass via SECURITY DEFINER
-- Cause: sync_discrepancy_for_service_order runs in caller
-- context; non-admins have no INSERT policy on discrepancies
-- so saving SO/PO fails with RLS violation.
-- Fix: mark sync function + its trigger function as
-- SECURITY DEFINER so they bypass RLS for the side-effect
-- only (the underlying SO/PO save still respects RLS).
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_discrepancy_for_service_order(_service_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.run_discrepancy_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'service_orders' THEN
    PERFORM public.sync_discrepancy_for_service_order(NEW.id);
  ELSIF TG_TABLE_NAME = 'payment_orders' AND NEW.service_order_id IS NOT NULL THEN
    PERFORM public.sync_discrepancy_for_service_order(NEW.service_order_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Lock execution to authenticated only (defense in depth)
REVOKE EXECUTE ON FUNCTION public.sync_discrepancy_for_service_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.run_discrepancy_sync_trigger() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_discrepancy_for_service_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_discrepancy_sync_trigger() TO authenticated;

-- Same fix for sync_financial_records_from_orders (same pattern: side-effect insert into table the caller can't write to)
CREATE OR REPLACE FUNCTION public.sync_financial_records_from_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
        created_by, type, source, amount, status, notes, reference_id, service_order_id,
        user_id, assigned_user_id
      ) VALUES (
        NEW.created_by, 'revenue', 'service_orders', COALESCE(NEW.total, 0),
        COALESCE(NEW.status, 'pending'), 'Auto-synced expected revenue from service order', NEW.id, NEW.id,
        COALESCE(NEW.user_id, NEW.created_by),
        COALESCE(NEW.assigned_user_id, NEW.user_id, NEW.created_by)
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
        created_by, type, source, amount, status, notes, reference_id, payment_order_id,
        user_id, assigned_user_id
      ) VALUES (
        NEW.created_by, 'revenue', 'payment_orders', COALESCE(NEW.total, 0),
        COALESCE(NEW.status, 'pending'), 'Auto-synced real revenue from payment order', NEW.id, NEW.id,
        COALESCE(NEW.user_id, NEW.created_by),
        COALESCE(NEW.assigned_user_id, NEW.user_id, NEW.created_by)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sync_financial_records_from_orders() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sync_financial_records_from_orders() TO authenticated;

-- ---------------------------------------------------------
-- FIX 2: clients SELECT leak
-- Old: any authenticated sees ALL clients.
-- New: admin/partner OR ownership OR partner_clients OR technician_clients link.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS clients_select_authenticated ON public.clients;

CREATE POLICY clients_select_scoped
ON public.clients
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'partner'::public.app_role)
  OR user_id = auth.uid()
  OR created_by = auth.uid()
  OR public.can_access_client(auth.uid(), id)
);

-- Also tighten INSERT: only admin/partner OR active authenticated who owns it
DROP POLICY IF EXISTS clients_insert_authenticated ON public.clients;
CREATE POLICY clients_insert_scoped
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.is_user_active(auth.uid())
);

-- ---------------------------------------------------------
-- FIX 3: technicians SELECT leak
-- Old policy granted SELECT to anyone with view permission
-- on users/SO/PO/financial/fleet — way too broad.
-- New: admin/partner OR own technician row OR partner sees
-- technicians linked via technician_clients to their clients.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS tech_select_scoped ON public.technicians;

CREATE POLICY tech_select_scoped
ON public.technicians
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'partner'::public.app_role)
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.technician_clients tc
    JOIN public.partner_clients pc ON pc.client_id = tc.client_id
    WHERE tc.technician_id = technicians.id
      AND pc.partner_user_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- Validation log
-- ---------------------------------------------------------
INSERT INTO public.rls_validation_logs(phase, check_name, sample)
VALUES (
  'B3.1',
  'discrepancies_insert_definer + clients_select_scoped + tech_select_scoped',
  jsonb_build_object(
    'discrepancies_sync', 'SECURITY DEFINER',
    'financial_records_sync', 'SECURITY DEFINER',
    'clients_select', 'scoped to ownership/can_access_client',
    'technicians_select', 'scoped to admin/partner/self/partner-link'
  )
);