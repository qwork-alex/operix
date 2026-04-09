
-- 1. Recriar trigger com bloqueio definitivo por invite_token
CREATE OR REPLACE FUNCTION public.provision_workspace_on_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app_user_id UUID;
  v_workspace_id UUID;
  v_name TEXT;
  v_has_membership BOOLEAN;
  v_raw_token TEXT;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  v_raw_token := NEW.raw_user_meta_data->>'invite_token';

  -- BLOQUEIO DEFINITIVO: se invite_token existe, NÃO criar workspace
  IF v_raw_token IS NOT NULL AND v_raw_token <> '' THEN
    -- Criar app_user mas NÃO criar workspace
    INSERT INTO public.app_users (auth_user_id, email, name)
    VALUES (NEW.id, NEW.email, v_name)
    ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email, name = COALESCE(public.app_users.name, EXCLUDED.name);

    INSERT INTO public.backend_event_logs (table_name, action, row_id, payload)
    VALUES ('auth', 'SIGNUP_BLOCKED_BY_INVITE', NEW.id,
      jsonb_build_object('email', NEW.email, 'invite_token', v_raw_token));

    RETURN NEW; -- PARAR AQUI - não criar workspace
  END IF;

  -- Fluxo normal sem convite: criar app_user + workspace
  INSERT INTO public.app_users (auth_user_id, email, name)
  VALUES (NEW.id, NEW.email, v_name)
  ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email, name = COALESCE(public.app_users.name, EXCLUDED.name)
  RETURNING id INTO v_app_user_id;

  SELECT EXISTS (
    SELECT 1 FROM public.memberships WHERE user_id = v_app_user_id
  ) INTO v_has_membership;

  IF NOT v_has_membership THEN
    INSERT INTO public.workspaces (name, owner_user_id)
    VALUES ('Workspace de ' || v_name, v_app_user_id)
    RETURNING id INTO v_workspace_id;

    INSERT INTO public.memberships (user_id, workspace_id, role, status)
    VALUES (v_app_user_id, v_workspace_id, 'admin', 'active');

    INSERT INTO public.backend_event_logs (table_name, action, row_id, payload)
    VALUES ('auth', 'SIGNUP_DEFAULT_WORKSPACE', NEW.id,
      jsonb_build_object('email', NEW.email, 'workspace_id', v_workspace_id::text));
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Função RPC autenticada para aplicar convite após signup/login
CREATE OR REPLACE FUNCTION public.apply_invite_after_auth(p_invite_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid UUID;
  v_app_user_id UUID;
  v_invite RECORD;
  v_existing_membership UUID;
  v_result jsonb;
BEGIN
  v_auth_uid := auth.uid();

  -- Log: token recebido
  INSERT INTO public.backend_event_logs (table_name, action, row_id, payload)
  VALUES ('invites', 'APPLY_INVITE_START', v_auth_uid,
    jsonb_build_object('invite_token', p_invite_token));

  -- Validar autenticação
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Buscar app_user
  SELECT id INTO v_app_user_id
  FROM public.app_users
  WHERE auth_user_id = v_auth_uid;

  IF v_app_user_id IS NULL THEN
    -- Criar app_user se não existe
    INSERT INTO public.app_users (auth_user_id, email, name)
    SELECT v_auth_uid, u.email, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
    FROM auth.users u WHERE u.id = v_auth_uid
    RETURNING id INTO v_app_user_id;
  END IF;

  -- Buscar convite válido
  SELECT i.* INTO v_invite
  FROM public.invites i
  WHERE i.token = p_invite_token::uuid
    AND i.accepted_at IS NULL
    AND (i.expires_at IS NULL OR i.expires_at > now());

  IF v_invite IS NULL THEN
    INSERT INTO public.backend_event_logs (table_name, action, row_id, payload)
    VALUES ('invites', 'APPLY_INVITE_NOT_FOUND', v_auth_uid,
      jsonb_build_object('invite_token', p_invite_token));
    RETURN jsonb_build_object('success', false, 'error', 'invite_not_found');
  END IF;

  -- Log: convite encontrado
  INSERT INTO public.backend_event_logs (table_name, action, row_id, payload)
  VALUES ('invites', 'APPLY_INVITE_FOUND', v_auth_uid,
    jsonb_build_object('invite_id', v_invite.id::text, 'workspace_id', v_invite.workspace_id::text, 'role', v_invite.role::text));

  -- Verificar se já é membro
  SELECT id INTO v_existing_membership
  FROM public.memberships
  WHERE user_id = v_app_user_id AND workspace_id = v_invite.workspace_id;

  IF v_existing_membership IS NULL THEN
    -- Criar membership com role do convite
    INSERT INTO public.memberships (user_id, workspace_id, role, status, source)
    VALUES (v_app_user_id, v_invite.workspace_id, v_invite.role, 'active', 'invite_link');

    INSERT INTO public.backend_event_logs (table_name, action, row_id, payload)
    VALUES ('invites', 'APPLY_INVITE_MEMBERSHIP_CREATED', v_auth_uid,
      jsonb_build_object('workspace_id', v_invite.workspace_id::text, 'role', v_invite.role::text, 'app_user_id', v_app_user_id::text));
  ELSE
    INSERT INTO public.backend_event_logs (table_name, action, row_id, payload)
    VALUES ('invites', 'APPLY_INVITE_ALREADY_MEMBER', v_auth_uid,
      jsonb_build_object('workspace_id', v_invite.workspace_id::text, 'membership_id', v_existing_membership::text));
  END IF;

  -- Marcar convite como usado
  UPDATE public.invites
  SET accepted_at = now(), accepted_by = v_app_user_id
  WHERE id = v_invite.id;

  INSERT INTO public.backend_event_logs (table_name, action, row_id, payload)
  VALUES ('invites', 'APPLY_INVITE_COMPLETE', v_auth_uid,
    jsonb_build_object('invite_id', v_invite.id::text, 'workspace_id', v_invite.workspace_id::text, 'role', v_invite.role::text));

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_invite.workspace_id::text,
    'role', v_invite.role::text,
    'workspace_name', (SELECT name FROM public.workspaces WHERE id = v_invite.workspace_id)
  );

EXCEPTION WHEN others THEN
  INSERT INTO public.backend_event_logs (table_name, action, row_id, payload)
  VALUES ('invites', 'APPLY_INVITE_ERROR', v_auth_uid,
    jsonb_build_object('invite_token', p_invite_token, 'error', SQLERRM));
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
