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
  v_provisioned_by_admin BOOLEAN;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  v_raw_token := NEW.raw_user_meta_data->>'invite_token';
  v_provisioned_by_admin := COALESCE((NEW.raw_user_meta_data->>'provisioned_by_admin')::boolean, false);

  -- BLOQUEIO: invite_token OR provisioned_by_admin => NO workspace, NO admin membership
  IF (v_raw_token IS NOT NULL AND v_raw_token <> '') OR v_provisioned_by_admin THEN
    INSERT INTO public.app_users (auth_user_id, email, name)
    VALUES (NEW.id, NEW.email, v_name)
    ON CONFLICT (auth_user_id) DO UPDATE
      SET email = EXCLUDED.email,
          name  = COALESCE(public.app_users.name, EXCLUDED.name);

    INSERT INTO public.backend_event_logs (table_name, action, row_id, payload)
    VALUES (
      'auth',
      CASE
        WHEN v_provisioned_by_admin THEN 'SIGNUP_BLOCKED_BY_ADMIN_PROVISION'
        ELSE 'SIGNUP_BLOCKED_BY_INVITE'
      END,
      NEW.id,
      jsonb_build_object(
        'email', NEW.email,
        'invite_token', v_raw_token,
        'provisioned_by_admin', v_provisioned_by_admin
      )
    );

    RETURN NEW;
  END IF;

  -- Real self-signup: create app_user + own workspace + admin membership
  INSERT INTO public.app_users (auth_user_id, email, name)
  VALUES (NEW.id, NEW.email, v_name)
  ON CONFLICT (auth_user_id) DO UPDATE
    SET email = EXCLUDED.email,
        name  = COALESCE(public.app_users.name, EXCLUDED.name)
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