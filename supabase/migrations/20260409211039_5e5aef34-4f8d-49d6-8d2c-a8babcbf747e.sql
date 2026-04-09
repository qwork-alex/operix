
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
  v_invite_token UUID;
  v_invite_exists BOOLEAN;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  -- Check if signup includes an invite token in metadata
  v_invite_token := NULLIF(NEW.raw_user_meta_data->>'invite_token', '')::UUID;

  -- Upsert app_user
  INSERT INTO public.app_users (auth_user_id, email, name)
  VALUES (NEW.id, NEW.email, v_name)
  ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email, name = COALESCE(public.app_users.name, EXCLUDED.name)
  RETURNING id INTO v_app_user_id;

  -- Check if a valid invite exists for this token
  v_invite_exists := FALSE;
  IF v_invite_token IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.invites
      WHERE token = v_invite_token
        AND accepted_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
    ) INTO v_invite_exists;
  END IF;

  -- If invite exists, skip workspace creation (JoinPage will handle membership)
  IF v_invite_exists THEN
    -- Log that we skipped workspace creation due to invite
    INSERT INTO public.backend_event_logs (table_name, action, row_id, payload)
    VALUES ('auth', 'SIGNUP_WITH_INVITE', NEW.id,
      jsonb_build_object('email', NEW.email, 'invite_token', v_invite_token::text));
    RETURN NEW;
  END IF;

  -- Check if this user already has a membership (e.g. pre-provisioned)
  SELECT EXISTS (
    SELECT 1 FROM public.memberships WHERE user_id = v_app_user_id
  ) INTO v_has_membership;

  -- Only create default workspace if no invite and no existing memberships
  IF NOT v_has_membership THEN
    INSERT INTO public.workspaces (name, owner_user_id)
    VALUES ('Workspace de ' || v_name, v_app_user_id)
    RETURNING id INTO v_workspace_id;

    INSERT INTO public.memberships (user_id, workspace_id, role, status)
    VALUES (v_app_user_id, v_workspace_id, 'admin', 'active');
  END IF;

  RETURN NEW;
END;
$function$;
