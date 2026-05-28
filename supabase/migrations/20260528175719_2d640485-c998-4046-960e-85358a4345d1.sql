DO $$
DECLARE
  v_ws uuid := '55b0f5fe-5e48-4f11-aef2-bc7c8c4f7f6d';
  v_os int; v_op int; v_pl int; v_inv int;
BEGIN
  SELECT count(*) INTO v_os FROM service_orders WHERE workspace_id = v_ws;
  SELECT count(*) INTO v_op FROM payment_orders WHERE workspace_id = v_ws;
  SELECT count(*) INTO v_pl FROM platforms WHERE workspace_id = v_ws;
  SELECT count(*) INTO v_inv FROM billing_invoices WHERE workspace_id = v_ws;
  IF v_os + v_op + v_pl + v_inv > 0 THEN
    RAISE EXCEPTION 'Phantom workspace has data — aborting';
  END IF;

  -- Delete subscription first (no protection trigger)
  DELETE FROM workspace_subscriptions WHERE workspace_id = v_ws;
  -- Delete the workspace; FK cascades clean up memberships and other refs
  DELETE FROM workspaces WHERE id = v_ws;
END $$;