-- 1. Trigger function to auto-create profile + default role for every new auth user
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  -- Default role: technician
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'technician'::public.app_role)
  ON CONFLICT (user_id) DO NOTHING;

  -- App user (workspace user record) — best effort, ignore if app_users has different shape
  BEGIN
    INSERT INTO public.app_users (auth_user_id, email, name)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- don't block auth signup if app_users insert fails
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- 2. Backfill existing auth users missing a profile
INSERT INTO public.profiles (id, email, full_name)
SELECT au.id, au.email, COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1))
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;

-- 3. Backfill existing auth users missing a role (default technician)
INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'technician'::public.app_role
FROM auth.users au
LEFT JOIN public.user_roles ur ON ur.user_id = au.id
WHERE ur.user_id IS NULL;

-- 4. Backfill app_users for any auth users missing one
INSERT INTO public.app_users (auth_user_id, email, name)
SELECT au.id, au.email, COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1))
FROM auth.users au
LEFT JOIN public.app_users a ON a.auth_user_id = au.id
WHERE a.auth_user_id IS NULL;

-- 5. Ensure RLS allows trigger inserts (SECURITY DEFINER bypasses RLS, but keep self/admin insert policies)
-- Existing policies already allow self or admin insert on profiles, user_roles, app_users.
-- No policy changes needed.
