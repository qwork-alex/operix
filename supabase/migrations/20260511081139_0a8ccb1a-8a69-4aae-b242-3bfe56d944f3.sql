
-- Phase B3.1b — Canonical ownership map for safe user deletion.
-- Returns per-table residual ownership counts split by blocking vs detachable,
-- so the edge function and UI agree on what can be removed cleanly.

CREATE OR REPLACE FUNCTION public.get_user_ownership_map(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v jsonb;
  v_app_user_id uuid;
  -- blocking = NOT-NULL ownership columns that would prevent auth.users delete unless reassigned
  c_so_user int := 0; c_so_assigned int := 0; c_so_created int := 0;
  c_po_user int := 0; c_po_assigned int := 0; c_po_created int := 0;
  -- detachable = nullable refs that the cleanup can null without losing rows
  c_fr_user int := 0; c_fr_assigned int := 0; c_fr_created int := 0;
  c_clients_user int := 0; c_clients_created int := 0;
  c_documents int := 0;
  c_fleet_trips int := 0; c_fleet_fuel int := 0; c_drivers int := 0;
  c_profit_rules_created int := 0; c_profit_rules_assigned int := 0;
  c_profit_dist_created int := 0; c_profit_dist_target int := 0;
  c_partner_clients int := 0;
  -- identity (will be hard-deleted)
  c_notifications int := 0; c_user_permissions int := 0; c_user_roles int := 0;
  c_technicians int := 0; c_profiles int := 0; c_user_settings int := 0;
  c_user_usage int := 0; c_memberships int := 0; c_app_users int := 0;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('error','uid_required'); END IF;

  SELECT id INTO v_app_user_id FROM public.app_users WHERE auth_user_id = _uid LIMIT 1;

  SELECT count(*) INTO c_so_user     FROM public.service_orders WHERE user_id = _uid;
  SELECT count(*) INTO c_so_assigned FROM public.service_orders WHERE assigned_user_id = _uid;
  SELECT count(*) INTO c_so_created  FROM public.service_orders WHERE created_by = _uid;
  SELECT count(*) INTO c_po_user     FROM public.payment_orders WHERE user_id = _uid;
  SELECT count(*) INTO c_po_assigned FROM public.payment_orders WHERE assigned_user_id = _uid;
  SELECT count(*) INTO c_po_created  FROM public.payment_orders WHERE created_by = _uid;

  SELECT count(*) INTO c_fr_user     FROM public.financial_records WHERE user_id = _uid;
  SELECT count(*) INTO c_fr_assigned FROM public.financial_records WHERE assigned_user_id = _uid;
  SELECT count(*) INTO c_fr_created  FROM public.financial_records WHERE created_by = _uid;

  SELECT count(*) INTO c_clients_user    FROM public.clients WHERE user_id = _uid;
  SELECT count(*) INTO c_clients_created FROM public.clients WHERE created_by = _uid;

  SELECT count(*) INTO c_documents   FROM public.documents WHERE uploaded_by = _uid;
  SELECT count(*) INTO c_fleet_trips FROM public.fleet_trips WHERE created_by = _uid;
  SELECT count(*) INTO c_fleet_fuel  FROM public.fleet_fuel_logs WHERE created_by = _uid;
  SELECT count(*) INTO c_drivers     FROM public.drivers WHERE created_by = _uid;

  SELECT count(*) INTO c_profit_rules_created  FROM public.profit_rules WHERE created_by = _uid;
  SELECT count(*) INTO c_profit_rules_assigned FROM public.profit_rules WHERE assigned_user_id = _uid;
  SELECT count(*) INTO c_profit_dist_created   FROM public.profit_distributions WHERE created_by = _uid;
  SELECT count(*) INTO c_profit_dist_target    FROM public.profit_distributions WHERE target_user_id = _uid;
  SELECT count(*) INTO c_partner_clients       FROM public.partner_clients WHERE partner_user_id = _uid;

  SELECT count(*) INTO c_notifications    FROM public.notifications WHERE user_id = _uid;
  SELECT count(*) INTO c_user_permissions FROM public.user_permissions WHERE user_id = _uid;
  SELECT count(*) INTO c_user_roles       FROM public.user_roles WHERE user_id = _uid;
  SELECT count(*) INTO c_technicians      FROM public.technicians WHERE user_id = _uid;
  SELECT count(*) INTO c_profiles         FROM public.profiles WHERE id = _uid;
  SELECT count(*) INTO c_user_settings    FROM public.user_settings WHERE user_id = _uid;

  IF v_app_user_id IS NOT NULL THEN
    SELECT count(*) INTO c_user_usage  FROM public.user_usage  WHERE user_id = v_app_user_id;
    SELECT count(*) INTO c_memberships FROM public.memberships WHERE user_id = v_app_user_id;
    SELECT count(*) INTO c_app_users   FROM public.app_users   WHERE id = v_app_user_id;
  END IF;

  v := jsonb_build_object(
    'auth_user_id', _uid,
    'app_user_id', v_app_user_id,
    'blocking', jsonb_build_object(
      -- service_orders/payment_orders.user_id and assigned_user_id are NOT NULL -> require reassign
      'service_orders_user_id', c_so_user,
      'service_orders_assigned_user_id', c_so_assigned,
      'payment_orders_user_id', c_po_user,
      'payment_orders_assigned_user_id', c_po_assigned
    ),
    'detachable', jsonb_build_object(
      'service_orders_created_by', c_so_created,
      'payment_orders_created_by', c_po_created,
      'financial_records_user_id', c_fr_user,
      'financial_records_assigned_user_id', c_fr_assigned,
      'financial_records_created_by', c_fr_created,
      'clients_user_id', c_clients_user,
      'clients_created_by', c_clients_created,
      'documents_uploaded_by', c_documents,
      'fleet_trips_created_by', c_fleet_trips,
      'fleet_fuel_logs_created_by', c_fleet_fuel,
      'drivers_created_by', c_drivers,
      'profit_rules_created_by', c_profit_rules_created,
      'profit_rules_assigned_user_id', c_profit_rules_assigned,
      'profit_distributions_created_by', c_profit_dist_created,
      'profit_distributions_target_user_id', c_profit_dist_target,
      'partner_clients_partner_user_id', c_partner_clients
    ),
    'identity', jsonb_build_object(
      'notifications', c_notifications,
      'user_permissions', c_user_permissions,
      'user_roles', c_user_roles,
      'technicians', c_technicians,
      'profiles', c_profiles,
      'user_settings', c_user_settings,
      'user_usage', c_user_usage,
      'memberships', c_memberships,
      'app_users', c_app_users
    ),
    'totals', jsonb_build_object(
      'blocking', c_so_user+c_so_assigned+c_po_user+c_po_assigned,
      'detachable', c_so_created+c_po_created+c_fr_user+c_fr_assigned+c_fr_created
                    +c_clients_user+c_clients_created+c_documents+c_fleet_trips+c_fleet_fuel
                    +c_drivers+c_profit_rules_created+c_profit_rules_assigned
                    +c_profit_dist_created+c_profit_dist_target+c_partner_clients,
      'identity', c_notifications+c_user_permissions+c_user_roles+c_technicians+c_profiles
                  +c_user_settings+c_user_usage+c_memberships+c_app_users
    ),
    'computed_at', now()
  );

  RETURN v;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_user_ownership_map(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_ownership_map(uuid) TO authenticated;

-- Track the phase
INSERT INTO public.rls_validation_logs (phase, check_name, before_count, after_count, sample)
VALUES ('B3.1b', 'get_user_ownership_map_created', 0, 1, '{"note":"safe-deletion canonical map"}'::jsonb);
