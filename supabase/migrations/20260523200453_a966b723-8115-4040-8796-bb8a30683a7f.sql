
-- Drop and recreate policies and RPCs with correct app_users.id translation

DROP POLICY IF EXISTS "workspace_invites_owner_select" ON public.workspace_invites;
CREATE POLICY "workspace_invites_owner_select" ON public.workspace_invites
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_users au
      JOIN public.memberships m ON m.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
        AND m.workspace_id = workspace_invites.workspace_id
        AND m.role IN ('admin','socio')
        AND m.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.app_users au
      JOIN public.workspaces w ON w.owner_user_id = au.id
      WHERE au.auth_user_id = auth.uid()
        AND w.id = workspace_invites.workspace_id
    )
  );

CREATE OR REPLACE FUNCTION public.create_workspace_invite_by_code(
  _workspace_id UUID,
  _display_code TEXT,
  _role public.membership_role
)
RETURNS public.workspace_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target UUID;
  v_caller_auth UUID := auth.uid();
  v_caller_app UUID;
  v_target_app UUID;
  v_can BOOLEAN;
  v_invite public.workspace_invites;
BEGIN
  IF v_caller_auth IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT id INTO v_caller_app FROM public.app_users WHERE auth_user_id = v_caller_auth LIMIT 1;
  IF v_caller_app IS NULL THEN RAISE EXCEPTION 'Conta sem app_user associado'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w WHERE w.id = _workspace_id AND w.owner_user_id = v_caller_app
  ) OR EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.workspace_id = _workspace_id AND m.user_id = v_caller_app
      AND m.role IN ('admin','socio') AND m.status = 'active'
  ) INTO v_can;
  IF NOT v_can THEN RAISE EXCEPTION 'Sem permissão para convidar neste workspace'; END IF;

  v_target := public.find_profile_by_display_code(_display_code);
  IF v_target IS NULL THEN RAISE EXCEPTION 'ID % não encontrado', _display_code; END IF;
  IF v_target = v_caller_auth THEN RAISE EXCEPTION 'Você não pode convidar a si mesmo'; END IF;

  -- Find target's app_user (may not exist for users that never logged in via this workspace)
  SELECT id INTO v_target_app FROM public.app_users WHERE auth_user_id = v_target LIMIT 1;

  IF v_target_app IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.memberships
    WHERE workspace_id = _workspace_id AND user_id = v_target_app AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Usuário já é membro deste workspace';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workspace_invites
    WHERE workspace_id = _workspace_id AND target_profile_id = v_target AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Já existe um convite pendente para este usuário';
  END IF;

  INSERT INTO public.workspace_invites (workspace_id, target_profile_id, role, created_by)
  VALUES (_workspace_id, v_target, _role, v_caller_auth)
  RETURNING * INTO v_invite;
  RETURN v_invite;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_workspace_invite(_invite_id UUID)
RETURNS public.memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_auth UUID := auth.uid();
  v_caller_app UUID;
  v_invite public.workspace_invites;
  v_membership public.memberships;
  v_profile RECORD;
BEGIN
  IF v_caller_auth IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_invite FROM public.workspace_invites WHERE id = _invite_id;
  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Convite não encontrado'; END IF;
  IF v_invite.target_profile_id <> v_caller_auth THEN RAISE EXCEPTION 'Este convite não é para você'; END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'Convite já foi respondido'; END IF;

  -- Ensure target has an app_user row in the target workspace
  SELECT id INTO v_caller_app
  FROM public.app_users
  WHERE auth_user_id = v_caller_auth AND (workspace_id = v_invite.workspace_id OR workspace_id IS NULL)
  ORDER BY (workspace_id = v_invite.workspace_id) DESC
  LIMIT 1;

  IF v_caller_app IS NULL THEN
    -- Create an app_user scoped to this workspace
    SELECT id, full_name, email, phone INTO v_profile FROM public.profiles WHERE id = v_caller_auth;
    INSERT INTO public.app_users (auth_user_id, email, name, phone, workspace_id)
    VALUES (v_caller_auth, COALESCE(v_profile.email,''), v_profile.full_name, v_profile.phone, v_invite.workspace_id)
    RETURNING id INTO v_caller_app;
  END IF;

  INSERT INTO public.memberships (user_id, workspace_id, role, status, source)
  VALUES (v_caller_app, v_invite.workspace_id, v_invite.role, 'active', 'workspace_invite')
  ON CONFLICT (user_id, workspace_id) DO UPDATE
    SET role = EXCLUDED.role, status = 'active', source = 'workspace_invite'
  RETURNING * INTO v_membership;

  UPDATE public.workspace_invites
    SET status = 'accepted', responded_at = now()
  WHERE id = _invite_id;

  RETURN v_membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_workspace_invite(_invite_id UUID)
RETURNS public.workspace_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_auth UUID := auth.uid();
  v_caller_app UUID;
  v_invite public.workspace_invites;
  v_can BOOLEAN;
BEGIN
  IF v_caller_auth IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_invite FROM public.workspace_invites WHERE id = _invite_id;
  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Convite não encontrado'; END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'Convite já foi respondido'; END IF;

  SELECT id INTO v_caller_app FROM public.app_users WHERE auth_user_id = v_caller_auth LIMIT 1;
  IF v_caller_app IS NULL THEN RAISE EXCEPTION 'Conta sem app_user'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w WHERE w.id = v_invite.workspace_id AND w.owner_user_id = v_caller_app
  ) OR EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.workspace_id = v_invite.workspace_id AND m.user_id = v_caller_app
      AND m.role IN ('admin','socio') AND m.status = 'active'
  ) INTO v_can;
  IF NOT v_can THEN RAISE EXCEPTION 'Sem permissão para cancelar este convite'; END IF;

  UPDATE public.workspace_invites
    SET status = 'cancelled', responded_at = now()
  WHERE id = _invite_id
  RETURNING * INTO v_invite;
  RETURN v_invite;
END;
$$;
