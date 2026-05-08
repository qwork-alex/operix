
-- ============================================================
-- FASE 1 — Camada paralela de contexto de identidade
-- Nada existente é alterado. Tudo abaixo é novo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_context(_workspace_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_app_user_id uuid;
  v_is_active boolean;
  v_is_owner boolean;
  v_db_role text;
  v_display_role text;
  v_effective_role text;
  v_current_ws uuid;
  v_workspace_ids uuid[];
  v_membership_role text;
  v_can_manage_all boolean;
  v_can_view_all boolean;
  v_technician_id uuid;
  v_is_admin boolean;
  v_is_partner boolean;
  v_is_technician boolean;
  v_is_client boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'auth_user_id', NULL,
      'is_active', false,
      'computed_at', now()
    );
  END IF;

  -- Email + active flags
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
  v_is_active := public.is_user_active(v_uid);

  -- app_user
  SELECT id INTO v_app_user_id FROM public.app_users WHERE auth_user_id = v_uid LIMIT 1;

  -- is_system_owner
  SELECT COALESCE(is_system_owner, false) INTO v_is_owner
  FROM public.profiles WHERE id = v_uid;
  v_is_owner := COALESCE(v_is_owner, false) OR (v_email = 'qwork@qworkgroup.com');

  -- DB role (single global role for now)
  SELECT role::text INTO v_db_role FROM public.user_roles WHERE user_id = v_uid LIMIT 1;

  v_display_role := CASE v_db_role
    WHEN 'admin'      THEN 'admin'
    WHEN 'partner'    THEN 'socio'
    WHEN 'technician' THEN 'tecnico'
    WHEN 'client'     THEN 'cliente'
    ELSE NULL
  END;

  -- Workspace resolution
  v_current_ws := COALESCE(
    _workspace_id,
    (SELECT workspace_id FROM public.app_users WHERE auth_user_id = v_uid AND workspace_id IS NOT NULL LIMIT 1)
  );

  SELECT array_agg(DISTINCT mem.workspace_id)
  INTO v_workspace_ids
  FROM public.memberships mem
  JOIN public.app_users au ON au.id = mem.user_id
  WHERE au.auth_user_id = v_uid AND mem.status = 'active';

  IF v_workspace_ids IS NULL THEN
    v_workspace_ids := ARRAY[]::uuid[];
  END IF;

  -- Membership role at current workspace
  SELECT mem.role::text INTO v_membership_role
  FROM public.memberships mem
  JOIN public.app_users au ON au.id = mem.user_id
  WHERE au.auth_user_id = v_uid
    AND mem.workspace_id = v_current_ws
    AND mem.status = 'active'
  LIMIT 1;

  v_effective_role := public.effective_role(v_uid, v_current_ws);

  -- Capabilities
  v_can_manage_all := public.can_manage_all_orders(v_uid);
  v_can_view_all   := public.has_global_view(v_uid);

  -- Technician id
  SELECT id INTO v_technician_id FROM public.technicians WHERE user_id = v_uid LIMIT 1;

  -- Flags (require active to be true)
  v_is_admin     := v_is_active AND public.has_role(v_uid, 'admin'::public.app_role);
  v_is_partner   := v_is_active AND public.has_role(v_uid, 'partner'::public.app_role);
  v_is_technician:= v_is_active AND public.has_role(v_uid, 'technician'::public.app_role);
  v_is_client    := v_is_active AND public.has_role(v_uid, 'client'::public.app_role);

  RETURN jsonb_build_object(
    'auth_user_id', v_uid,
    'app_user_id', v_app_user_id,
    'email', v_email,
    'is_active', v_is_active,
    'is_system_owner', v_is_owner,
    'primary_role', v_display_role,
    'primary_db_role', v_db_role,
    'secondary_roles', '[]'::jsonb,
    'current_workspace_id', v_current_ws,
    'workspace_ids', to_jsonb(v_workspace_ids),
    'membership_role', v_membership_role,
    'effective_role', v_effective_role,
    'can_manage_all', COALESCE(v_can_manage_all, false),
    'can_view_all_workspace', COALESCE(v_can_view_all, false),
    'ownership', jsonb_build_object(
      'technician_id', v_technician_id,
      'owns_filter_uids', to_jsonb(ARRAY[v_uid])
    ),
    'flags', jsonb_build_object(
      'is_admin', COALESCE(v_is_admin, false),
      'is_partner', COALESCE(v_is_partner, false),
      'is_technician', COALESCE(v_is_technician, false),
      'is_client', COALESCE(v_is_client, false),
      'is_impersonating', false
    ),
    'computed_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_context(uuid) TO authenticated;

-- View paralela para leitura simples no FE
CREATE OR REPLACE VIEW public.v_user_context_self
WITH (security_invoker = on) AS
SELECT public.get_user_context() AS ctx;

GRANT SELECT ON public.v_user_context_self TO authenticated;

-- Marker em rls_validation_logs para auditoria
INSERT INTO public.rls_validation_logs (phase, check_name, sample)
VALUES (
  'user_context_v1',
  'function_created',
  jsonb_build_object('function', 'get_user_context', 'view', 'v_user_context_self')
);
