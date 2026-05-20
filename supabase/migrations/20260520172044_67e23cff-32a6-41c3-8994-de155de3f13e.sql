
-- =====================================================================
-- PHASE 5: ENTERPRISE AUDIT SYSTEM
-- Workspace-isolated, generic audit log with before/after values
-- and a safe restore RPC for admin/system owner.
-- =====================================================================

-- ---------- 1) audit_log table ----------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid,
  table_name      text NOT NULL,
  row_id          uuid,
  operation       text NOT NULL CHECK (operation IN (
    'INSERT','UPDATE','DELETE','RESTORE',
    'IMPORT','EXPORT','ASSIGNMENT','PERMISSION',
    'LOGIN','LOGOUT','SYSTEM'
  )),
  actor_user_id   uuid,
  actor_email     text,
  origin          text NOT NULL DEFAULT 'manual'
                    CHECK (origin IN ('manual','automatic','system','import','trigger')),
  old_values      jsonb,
  new_values      jsonb,
  changed_fields  text[],
  session_id      text,
  ip_address      inet,
  user_agent      text,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_workspace_idx ON public.audit_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_table_idx     ON public.audit_log(table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_row_idx       ON public.audit_log(table_name, row_id);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx     ON public.audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_op_idx        ON public.audit_log(operation, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Read: members of the workspace OR system owner OR global admin.
-- Insert: triggers/edge functions only (security definer); deny direct.
-- Update/Delete: forbidden (immutable audit).
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_system_owner = true
  )
  OR (
    workspace_id IS NOT NULL
    AND workspace_id IN (
      SELECT m.workspace_id
      FROM public.memberships m
      JOIN public.app_users au ON au.id = m.user_id
      WHERE au.auth_user_id = auth.uid() AND m.status = 'active'
    )
  )
);

DROP POLICY IF EXISTS audit_log_no_write ON public.audit_log;
CREATE POLICY audit_log_no_write ON public.audit_log
FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS audit_log_no_update ON public.audit_log;
CREATE POLICY audit_log_no_update ON public.audit_log
FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS audit_log_no_delete ON public.audit_log;
CREATE POLICY audit_log_no_delete ON public.audit_log
FOR DELETE TO authenticated USING (false);

-- ---------- 2) Helper: extract workspace_id from any record ----------
CREATE OR REPLACE FUNCTION public._audit_extract_workspace(_rec jsonb)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(_rec->>'workspace_id', '')::uuid
$$;

-- ---------- 3) Generic audit trigger ----------
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old      jsonb;
  v_new      jsonb;
  v_ws       uuid;
  v_row_id   uuid;
  v_changed  text[] := ARRAY[]::text[];
  v_op       text;
  v_actor    uuid := auth.uid();
  v_email    text;
  v_key      text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_op  := 'INSERT';
    v_new := to_jsonb(NEW);
    v_ws  := public._audit_extract_workspace(v_new);
    v_row_id := NULLIF(v_new->>'id','')::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    v_op  := 'UPDATE';
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_ws  := COALESCE(public._audit_extract_workspace(v_new), public._audit_extract_workspace(v_old));
    v_row_id := NULLIF(v_new->>'id','')::uuid;
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF (v_new->v_key) IS DISTINCT FROM (v_old->v_key) THEN
        v_changed := array_append(v_changed, v_key);
      END IF;
    END LOOP;
    -- Skip noise: only updated_at touched
    IF array_length(v_changed,1) = 1 AND v_changed[1] = 'updated_at' THEN
      RETURN NEW;
    END IF;
  ELSE
    v_op  := 'DELETE';
    v_old := to_jsonb(OLD);
    v_ws  := public._audit_extract_workspace(v_old);
    v_row_id := NULLIF(v_old->>'id','')::uuid;
  END IF;

  IF v_actor IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_actor;
  END IF;

  INSERT INTO public.audit_log (
    workspace_id, table_name, row_id, operation,
    actor_user_id, actor_email, origin,
    old_values, new_values, changed_fields
  ) VALUES (
    v_ws, TG_TABLE_NAME, v_row_id, v_op,
    v_actor, v_email,
    CASE WHEN v_actor IS NULL THEN 'system' ELSE 'manual' END,
    v_old, v_new,
    CASE WHEN array_length(v_changed,1) > 0 THEN v_changed ELSE NULL END
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
EXCEPTION WHEN OTHERS THEN
  -- Audit must never block business operations
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- ---------- 4) Attach trigger to key tables ----------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'service_orders','payment_orders','financial_records',
    'fleet_fuel_logs','fleet_vehicles','drivers','technicians',
    'clients','memberships','user_roles','user_permissions',
    'profit_rules','documents','app_users','workspaces'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%I
           AFTER INSERT OR UPDATE OR DELETE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()',
        t, t
      );
    END IF;
  END LOOP;
END$$;

-- ---------- 5) Manual audit log RPC (for non-DB events) ----------
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _table     text,
  _operation text,
  _row_id    uuid DEFAULT NULL,
  _workspace uuid DEFAULT NULL,
  _old       jsonb DEFAULT NULL,
  _new       jsonb DEFAULT NULL,
  _reason    text DEFAULT NULL,
  _origin    text DEFAULT 'manual'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id    uuid;
  v_actor uuid := auth.uid();
  v_email text;
BEGIN
  IF _operation NOT IN ('INSERT','UPDATE','DELETE','RESTORE','IMPORT','EXPORT','ASSIGNMENT','PERMISSION','LOGIN','LOGOUT','SYSTEM') THEN
    RAISE EXCEPTION 'Invalid operation: %', _operation;
  END IF;
  IF _origin NOT IN ('manual','automatic','system','import','trigger') THEN
    _origin := 'manual';
  END IF;

  IF v_actor IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_actor;
  END IF;

  INSERT INTO public.audit_log(
    workspace_id, table_name, row_id, operation,
    actor_user_id, actor_email, origin,
    old_values, new_values, reason
  ) VALUES (
    _workspace, _table, _row_id, _operation,
    v_actor, v_email, _origin, _old, _new, _reason
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(text,text,uuid,uuid,jsonb,jsonb,text,text) TO authenticated;

-- ---------- 6) Restore RPC (admin/system owner only, whitelist tables) ----------
CREATE OR REPLACE FUNCTION public.restore_audit_record(_audit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_rec   public.audit_log%ROWTYPE;
  v_allowed text[] := ARRAY[
    'service_orders','payment_orders','financial_records',
    'fleet_fuel_logs','fleet_vehicles','drivers','technicians',
    'clients','profit_rules','documents'
  ];
  v_sql   text;
  v_data  jsonb;
  v_email text;
  v_is_owner boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_actor;
  v_is_owner := COALESCE(lower(v_email),'') = 'qwork@qworkgroup.com';

  IF NOT (public.has_role(v_actor,'admin'::public.app_role) OR v_is_owner) THEN
    RAISE EXCEPTION 'Only administrators can restore records.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rec FROM public.audit_log WHERE id = _audit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Audit entry not found';
  END IF;

  IF NOT (v_rec.table_name = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Table % is not restorable', v_rec.table_name USING ERRCODE = '42501';
  END IF;

  -- Choose payload to restore: prefer old_values (UPDATE/DELETE), fall back to new_values
  v_data := COALESCE(v_rec.old_values, v_rec.new_values);
  IF v_data IS NULL OR v_rec.row_id IS NULL THEN
    RAISE EXCEPTION 'Nothing to restore';
  END IF;

  IF v_rec.operation = 'DELETE' THEN
    -- Re-insert the row from old_values
    v_sql := format(
      'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, %L) ON CONFLICT (id) DO NOTHING',
      v_rec.table_name, v_rec.table_name, v_data::text
    );
    EXECUTE v_sql;
  ELSE
    -- UPDATE: rewrite the row to old_values (only allowed if it still exists)
    v_sql := format(
      'UPDATE public.%I AS t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, %L) src) WHERE t.id = %L',
      v_rec.table_name,
      (SELECT string_agg(quote_ident(k),',') FROM jsonb_object_keys(v_data) k WHERE k NOT IN ('id','created_at')),
      (SELECT string_agg('src.'||quote_ident(k),',') FROM jsonb_object_keys(v_data) k WHERE k NOT IN ('id','created_at')),
      v_rec.table_name, v_data::text, v_rec.row_id
    );
    EXECUTE v_sql;
  END IF;

  -- Log the restore action itself
  INSERT INTO public.audit_log(
    workspace_id, table_name, row_id, operation,
    actor_user_id, actor_email, origin, new_values, reason
  ) VALUES (
    v_rec.workspace_id, v_rec.table_name, v_rec.row_id, 'RESTORE',
    v_actor, v_email, 'manual', v_data,
    'Restored from audit entry ' || _audit_id::text
  );

  RETURN jsonb_build_object('success', true, 'table', v_rec.table_name, 'row_id', v_rec.row_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_audit_record(uuid) TO authenticated;

-- ---------- 7) Performance: cap retention via partial purge helper (optional, manual) ----------
CREATE OR REPLACE FUNCTION public.audit_log_purge_older_than(_days int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF _days < 30 THEN RAISE EXCEPTION 'Refusing to purge less than 30 days'; END IF;
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin required';
  END IF;
  DELETE FROM public.audit_log WHERE created_at < now() - (_days || ' days')::interval;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
