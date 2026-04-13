
-- Drop the broken trigger and function
DROP TRIGGER IF EXISTS trg_sync_so_status_on_po_change ON public.payment_orders;
DROP FUNCTION IF EXISTS public.sync_so_status_from_po();

-- Recreate with array-based logic (no temp tables, no DELETE)
CREATE OR REPLACE FUNCTION public.sync_so_status_from_po()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_po RECORD;
  v_so_ids uuid[];
  v_so_id uuid;
  v_so_week text;
  v_so_plate text;
  v_norm_plate text;
  v_statuses text[];
  v_effective_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_po := OLD;
  ELSE
    v_po := NEW;
  END IF;

  v_so_ids := ARRAY[]::uuid[];

  -- Priority 1: direct link
  IF v_po.service_order_id IS NOT NULL THEN
    v_so_ids := array_append(v_so_ids, v_po.service_order_id);
  END IF;

  -- Priority 2: match by list_name (week) + normalized license_plate
  IF v_po.list_name IS NOT NULL AND v_po.license_plate IS NOT NULL THEN
    v_norm_plate := upper(regexp_replace(COALESCE(v_po.license_plate, ''), '[\s\-]', '', 'g'));
    IF v_norm_plate <> '' THEN
      SELECT array_agg(so.id) INTO v_so_ids
      FROM (
        SELECT unnest(v_so_ids) AS id
        UNION
        SELECT so.id FROM public.service_orders so
        WHERE so.week = v_po.list_name
          AND upper(regexp_replace(COALESCE(so.license_plate, ''), '[\s\-]', '', 'g')) = v_norm_plate
      ) sub;
    END IF;
  END IF;

  -- Remove nulls
  IF v_so_ids IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- For each affected SO, recalculate status
  FOREACH v_so_id IN ARRAY v_so_ids LOOP
    IF v_so_id IS NULL THEN CONTINUE; END IF;

    SELECT week, license_plate INTO v_so_week, v_so_plate
    FROM public.service_orders WHERE id = v_so_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT array_agg(DISTINCT sub.status) INTO v_statuses
    FROM (
      SELECT po.status FROM public.payment_orders po WHERE po.service_order_id = v_so_id
      UNION ALL
      SELECT po.status FROM public.payment_orders po
      WHERE v_so_week IS NOT NULL
        AND po.list_name = v_so_week
        AND upper(regexp_replace(COALESCE(po.license_plate, ''), '[\s\-]', '', 'g'))
          = upper(regexp_replace(COALESCE(v_so_plate, ''), '[\s\-]', '', 'g'))
        AND upper(regexp_replace(COALESCE(v_so_plate, ''), '[\s\-]', '', 'g')) <> ''
    ) sub;

    IF v_statuses IS NULL OR array_length(v_statuses, 1) IS NULL THEN
      v_effective_status := 'pending';
    ELSIF v_statuses = ARRAY['paid'] THEN
      v_effective_status := 'paid';
    ELSIF v_statuses = ARRAY['pending'] THEN
      v_effective_status := 'pending';
    ELSE
      v_effective_status := 'partial';
    END IF;

    UPDATE public.service_orders
    SET status = v_effective_status, updated_at = now()
    WHERE id = v_so_id AND status IS DISTINCT FROM v_effective_status;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Recreate the trigger
CREATE TRIGGER trg_sync_so_status_on_po_change
AFTER INSERT OR UPDATE OR DELETE ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_so_status_from_po();
