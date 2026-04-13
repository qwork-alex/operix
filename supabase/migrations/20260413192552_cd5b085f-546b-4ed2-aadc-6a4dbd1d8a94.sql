
-- Step 1: Add group_id column to both tables
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS group_id text;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS group_id text;

-- Step 2: Create indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_service_orders_group_id ON public.service_orders(group_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_group_id ON public.payment_orders(group_id);

-- Step 3: Populate existing data
-- For service_orders, use week as group_id
UPDATE public.service_orders SET group_id = week WHERE group_id IS NULL AND week IS NOT NULL;
-- For payment_orders, use list_name as group_id
UPDATE public.payment_orders SET group_id = list_name WHERE group_id IS NULL AND list_name IS NOT NULL;

-- Step 4: Replace the sync trigger function to prioritize group_id
CREATE OR REPLACE FUNCTION public.sync_so_status_from_po()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_po RECORD;
  v_so_ids uuid[];
  v_so_id uuid;
  v_so_week text;
  v_so_plate text;
  v_norm_plate text;
  v_matched_ids uuid[];
  v_statuses text[];
  v_effective_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_po := OLD;
  ELSE
    v_po := NEW;
  END IF;

  v_so_ids := ARRAY[]::uuid[];

  -- Priority 1: direct link via service_order_id
  IF v_po.service_order_id IS NOT NULL THEN
    v_so_ids := array_append(v_so_ids, v_po.service_order_id);
  END IF;

  -- Priority 2: match by group_id (NEW - single source of truth)
  IF v_po.group_id IS NOT NULL THEN
    SELECT array_agg(so.id) INTO v_matched_ids
    FROM public.service_orders so
    WHERE so.group_id = v_po.group_id;

    IF v_matched_ids IS NOT NULL THEN
      v_so_ids := v_so_ids || v_matched_ids;
    END IF;
  END IF;

  -- Priority 3 (fallback): match by list_name (week) + normalized license_plate
  IF v_po.list_name IS NOT NULL AND v_po.license_plate IS NOT NULL THEN
    v_norm_plate := upper(regexp_replace(COALESCE(v_po.license_plate, ''), '[\s\-]', '', 'g'));
    IF v_norm_plate <> '' THEN
      SELECT array_agg(so.id) INTO v_matched_ids
      FROM public.service_orders so
      WHERE so.week = v_po.list_name
        AND upper(regexp_replace(COALESCE(so.license_plate, ''), '[\s\-]', '', 'g')) = v_norm_plate;

      IF v_matched_ids IS NOT NULL THEN
        v_so_ids := v_so_ids || v_matched_ids;
      END IF;
    END IF;
  END IF;

  -- Deduplicate and remove nulls
  SELECT array_agg(DISTINCT x) INTO v_so_ids
  FROM unnest(v_so_ids) x
  WHERE x IS NOT NULL;

  IF v_so_ids IS NULL OR array_length(v_so_ids, 1) IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- For each affected SO, recalculate status from ALL linked POs
  FOREACH v_so_id IN ARRAY v_so_ids LOOP
    SELECT week, license_plate INTO v_so_week, v_so_plate
    FROM public.service_orders WHERE id = v_so_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT array_agg(DISTINCT sub.status) INTO v_statuses
    FROM (
      -- Match by direct link
      SELECT po.status FROM public.payment_orders po WHERE po.service_order_id = v_so_id
      UNION ALL
      -- Match by group_id
      SELECT po.status FROM public.payment_orders po
      WHERE po.group_id IS NOT NULL
        AND po.group_id = (SELECT so2.group_id FROM public.service_orders so2 WHERE so2.id = v_so_id)
        AND (SELECT so2.group_id FROM public.service_orders so2 WHERE so2.id = v_so_id) IS NOT NULL
      UNION ALL
      -- Fallback: match by week + plate
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

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

-- Step 5: Ensure triggers exist (recreate to pick up new function)
DROP TRIGGER IF EXISTS trg_sync_so_status_on_po_change ON public.payment_orders;
CREATE TRIGGER trg_sync_so_status_on_po_change
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_so_status_from_po();
