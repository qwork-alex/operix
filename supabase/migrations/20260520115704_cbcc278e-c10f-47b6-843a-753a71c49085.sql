
-- =========================================================
-- Phase 2.5 — Hard Isolation Layer (ADDITIVE, non-destructive)
-- =========================================================

-- ---------- Helpers ----------
CREATE OR REPLACE FUNCTION public.user_workspace_ids(_uid uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.workspace_id
  FROM public.memberships m
  JOIN public.app_users au ON au.id = m.user_id
  WHERE au.auth_user_id = _uid
    AND m.status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(_uid uuid, _ws uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _ws IS NOT NULL
     AND _uid IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.user_workspace_ids(_uid) x WHERE x = _ws
     )
$$;

CREATE OR REPLACE FUNCTION public.has_role_in_workspace(
  _uid uuid, _role public.app_role, _ws uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, _role) AND public.is_workspace_member(_uid, _ws)
$$;

-- ---------- Additive workspace-scoped policies ----------
-- Loop helper inline via DO block: for each table, create a SELECT policy
-- and an INSERT WITH CHECK policy. Idempotent (DROP IF EXISTS first).

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'service_orders','payment_orders','billing_invoices','billing_attachments',
    'billing_payments','billing_reconciliations','financial_records','documents',
    'fleet_trips','fleet_fuel_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- SELECT (permissive, additive)
    EXECUTE format('DROP POLICY IF EXISTS ws_scope_select ON public.%I', t);
    EXECUTE format($p$
      CREATE POLICY ws_scope_select ON public.%I
        FOR SELECT TO authenticated
        USING (workspace_id IS NOT NULL
               AND public.is_workspace_member(auth.uid(), workspace_id))
    $p$, t);

    -- INSERT guard (permissive, additive): if workspace_id provided, must belong to user.
    -- When workspace_id is NULL the trigger fills it; this policy then passes.
    EXECUTE format('DROP POLICY IF EXISTS ws_scope_insert ON public.%I', t);
    EXECUTE format($p$
      CREATE POLICY ws_scope_insert ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (workspace_id IS NULL
                    OR public.is_workspace_member(auth.uid(), workspace_id))
    $p$, t);

    -- UPDATE guard (permissive, additive)
    EXECUTE format('DROP POLICY IF EXISTS ws_scope_update ON public.%I', t);
    EXECUTE format($p$
      CREATE POLICY ws_scope_update ON public.%I
        FOR UPDATE TO authenticated
        USING (workspace_id IS NOT NULL
               AND public.is_workspace_member(auth.uid(), workspace_id))
        WITH CHECK (workspace_id IS NULL
                    OR public.is_workspace_member(auth.uid(), workspace_id))
    $p$, t);

    -- DELETE guard (permissive, additive)
    EXECUTE format('DROP POLICY IF EXISTS ws_scope_delete ON public.%I', t);
    EXECUTE format($p$
      CREATE POLICY ws_scope_delete ON public.%I
        FOR DELETE TO authenticated
        USING (workspace_id IS NOT NULL
               AND public.is_workspace_member(auth.uid(), workspace_id))
    $p$, t);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.user_workspace_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_in_workspace(uuid, public.app_role, uuid) TO authenticated;
