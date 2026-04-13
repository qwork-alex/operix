
-- Function to sync service order status from payment orders
CREATE OR REPLACE FUNCTION public.sync_so_status_from_po()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_po RECORD;
  v_so_id uuid;
  v_so RECORD;
  v_statuses text[];
  v_effective_status text;
  v_norm_plate text;
BEGIN
  -- Get the relevant PO row
  IF TG_OP = 'DELETE' THEN
    v_po := OLD;
  ELSE
    v_po := NEW;
  END IF;

  -- Collect all service_order IDs that this PO relates to
  -- into a temp table to process
  CREATE TEMP TABLE IF NOT EXISTS _affected_so_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
  DELETE FROM _affected_so_ids;

  -- Priority 1: direct link
  IF v_po.service_order_id IS NOT NULL THEN
    INSERT INTO _affected_so_ids (id) VALUES (v_po.service_order_id) ON CONFLICT DO NOTHING;
  END IF;

  -- Priority 2: match by list_name (week) + normalized license_plate
  IF v_po.list_name IS NOT NULL AND v_po.license_plate IS NOT NULL THEN
    v_norm_plate := upper(regexp_replace(COALESCE(v_po.license_plate, ''), '[\s\-]', '', 'g'));
    IF v_norm_plate <> '' THEN
      INSERT INTO _affected_so_ids (id)
      SELECT so.id FROM public.service_orders so
      WHERE so.week = v_po.list_name
        AND upper(regexp_replace(COALESCE(so.license_plate, ''), '[\s\-]', '', 'g')) = v_norm_plate
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- For each affected SO, recalculate status
  FOR v_so IN SELECT * FROM _affected_so_ids LOOP
    v_so_id := v_so.id;

    -- Get the SO's week and plate for cross-matching
    SELECT week, license_plate INTO v_so
    FROM public.service_orders WHERE id = v_so_id;

    -- Collect all PO statuses linked to this SO
    SELECT array_agg(DISTINCT sub.status) INTO v_statuses
    FROM (
      -- By direct link
      SELECT po.status FROM public.payment_orders po WHERE po.service_order_id = v_so_id
      UNION ALL
      -- By week + plate
      SELECT po.status FROM public.payment_orders po
      WHERE v_so.week IS NOT NULL
        AND po.list_name = v_so.week
        AND upper(regexp_replace(COALESCE(po.license_plate, ''), '[\s\-]', '', 'g'))
          = upper(regexp_replace(COALESCE(v_so.license_plate, ''), '[\s\-]', '', 'g'))
        AND upper(regexp_replace(COALESCE(v_so.license_plate, ''), '[\s\-]', '', 'g')) <> ''
    ) sub;

    -- Determine effective status
    IF v_statuses IS NULL OR array_length(v_statuses, 1) IS NULL THEN
      v_effective_status := 'pending';
    ELSIF v_statuses = ARRAY['paid'] THEN
      v_effective_status := 'paid';
    ELSIF v_statuses = ARRAY['pending'] THEN
      v_effective_status := 'pending';
    ELSE
      v_effective_status := 'partial';
    END IF;

    -- Update SO status
    UPDATE public.service_orders
    SET status = v_effective_status, updated_at = now()
    WHERE id = v_so_id AND status IS DISTINCT FROM v_effective_status;
  END LOOP;

  DROP TABLE IF EXISTS _affected_so_ids;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger on payment_orders
DROP TRIGGER IF EXISTS trg_sync_so_status_on_po_change ON public.payment_orders;
CREATE TRIGGER trg_sync_so_status_on_po_change
AFTER INSERT OR UPDATE OR DELETE ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_so_status_from_po();
