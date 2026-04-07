
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
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  -- Upsert app_user
  INSERT INTO public.app_users (auth_user_id, email, name)
  VALUES (NEW.id, NEW.email, v_name)
  ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email, name = COALESCE(public.app_users.name, EXCLUDED.name)
  RETURNING id INTO v_app_user_id;

  -- Check if this user was already invited (has existing membership)
  SELECT EXISTS (
    SELECT 1 FROM public.memberships WHERE user_id = v_app_user_id
  ) INTO v_has_membership;

  -- Only create default workspace if user has NO existing memberships (not invited)
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
