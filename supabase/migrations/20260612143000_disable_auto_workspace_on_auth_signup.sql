-- FASE 1 — identidade separada de workspace.
-- Um novo auth user nao deve nascer com workspace proprio automaticamente.
-- O trigger continua responsavel apenas por garantir a identidade base em app_users.

CREATE OR REPLACE FUNCTION public.provision_workspace_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_email text;
BEGIN
  v_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'Utilisateur'
  );
  v_email := lower(COALESCE(NEW.email, ''));

  INSERT INTO public.app_users (auth_user_id, email, name)
  VALUES (NEW.id, v_email, v_name)
  ON CONFLICT (auth_user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, public.app_users.name);

  RETURN NEW;
END;
$$;
