
-- 1. Create enums
CREATE TYPE public.membership_role AS ENUM ('admin', 'tecnico', 'cliente', 'socio');
CREATE TYPE public.membership_status AS ENUM ('active', 'pending');

-- 2. Create app_users table (named app_users to avoid conflict with auth.users)
CREATE TABLE public.app_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "full_access_authenticated" ON public.app_users
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Create workspaces table
CREATE TABLE public.workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "full_access_authenticated" ON public.workspaces
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Create memberships table
CREATE TABLE public.memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role membership_role NOT NULL DEFAULT 'admin',
  status membership_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id)
);

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "full_access_authenticated" ON public.memberships
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Create indexes
CREATE INDEX idx_app_users_auth_user_id ON public.app_users(auth_user_id);
CREATE INDEX idx_memberships_user_id ON public.memberships(user_id);
CREATE INDEX idx_memberships_workspace_id ON public.memberships(workspace_id);
CREATE INDEX idx_workspaces_owner ON public.workspaces(owner_user_id);

-- 6. Auto-provision function: creates app_user + workspace + membership on signup
CREATE OR REPLACE FUNCTION public.provision_workspace_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app_user_id UUID;
  v_workspace_id UUID;
  v_name TEXT;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.app_users (auth_user_id, email, name)
  VALUES (NEW.id, NEW.email, v_name)
  ON CONFLICT (auth_user_id) DO NOTHING
  RETURNING id INTO v_app_user_id;

  -- If already existed, fetch id
  IF v_app_user_id IS NULL THEN
    SELECT id INTO v_app_user_id FROM public.app_users WHERE auth_user_id = NEW.id;
  END IF;

  -- Create default workspace
  INSERT INTO public.workspaces (name, owner_user_id)
  VALUES ('Workspace de ' || v_name, v_app_user_id)
  RETURNING id INTO v_workspace_id;

  -- Create admin membership
  INSERT INTO public.memberships (user_id, workspace_id, role, status)
  VALUES (v_app_user_id, v_workspace_id, 'admin', 'active');

  RETURN NEW;
END;
$$;

-- 7. Attach trigger to auth.users (fires AFTER insert, after existing handle_new_user)
CREATE TRIGGER on_auth_user_created_provision_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_workspace_on_signup();
