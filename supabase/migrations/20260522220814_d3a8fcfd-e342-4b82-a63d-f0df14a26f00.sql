
-- 1) Signup default role
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invite_token TEXT;
  v_provisioned_by_admin BOOLEAN;
  v_is_self_signup BOOLEAN;
BEGIN
  v_invite_token := NEW.raw_user_meta_data->>'invite_token';
  v_provisioned_by_admin := COALESCE((NEW.raw_user_meta_data->>'provisioned_by_admin')::boolean, false);
  v_is_self_signup := (v_invite_token IS NULL OR v_invite_token = '') AND NOT v_provisioned_by_admin;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  IF v_is_self_signup THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  BEGIN
    INSERT INTO public.app_users (auth_user_id, email, name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;

-- 2) Workspace owner enforcement
CREATE OR REPLACE FUNCTION public.enforce_workspace_owner_is_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth_uid UUID;
  v_role public.app_role;
BEGIN
  IF NEW.owner_user_id IS NULL THEN RETURN NEW; END IF;
  SELECT auth_user_id INTO v_auth_uid FROM public.app_users WHERE id = NEW.owner_user_id;
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Workspace owner must reference a real authenticated user.';
  END IF;
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_auth_uid;
  IF v_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'Workspace owner must have admin role (got %). Technicians, clients and partners cannot own a workspace.', COALESCE(v_role::text, 'none');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspaces_owner_must_be_admin ON public.workspaces;
CREATE TRIGGER trg_workspaces_owner_must_be_admin
BEFORE INSERT OR UPDATE OF owner_user_id ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.enforce_workspace_owner_is_admin();

-- 3) Admin membership enforcement
CREATE OR REPLACE FUNCTION public.enforce_admin_membership_requires_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth_uid UUID;
  v_role public.app_role;
BEGIN
  IF NEW.role <> 'admin' THEN RETURN NEW; END IF;
  SELECT auth_user_id INTO v_auth_uid FROM public.app_users WHERE id = NEW.user_id;
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Membership user must reference a real authenticated user.';
  END IF;
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_auth_uid;
  IF v_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'Cannot grant admin membership to a non-admin user (current global role: %).', COALESCE(v_role::text, 'none');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_memberships_admin_requires_admin_role ON public.memberships;
CREATE TRIGGER trg_memberships_admin_requires_admin_role
BEFORE INSERT OR UPDATE OF role ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_membership_requires_admin_role();

-- 4) Orphan cleanup: delete workspace (cascades membership; owner-protect trigger
--    is bypassed because the workspace row is gone before the cascade row check).
--    We temporarily disable the protect trigger to be safe.
ALTER TABLE public.memberships DISABLE TRIGGER USER;
DELETE FROM public.workspaces WHERE id = 'b95977b8-8d6c-44b4-8bb6-0c189aee0d00';
ALTER TABLE public.memberships ENABLE TRIGGER USER;

INSERT INTO public.backend_event_logs (table_name, action, row_id, payload)
VALUES (
  'workspaces',
  'ORPHAN_TECHNICIAN_WORKSPACE_CLEANED',
  'b95977b8-8d6c-44b4-8bb6-0c189aee0d00',
  jsonb_build_object('former_owner_app_user', '24c69026-2f7e-492c-8dd9-578defaf3471')
);

-- 5) Block app_user deletion if they still own a workspace
CREATE OR REPLACE FUNCTION public.block_delete_workspace_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INT;
  v_names TEXT;
BEGIN
  SELECT count(*), string_agg(name, ', ')
    INTO v_count, v_names
  FROM public.workspaces WHERE owner_user_id = OLD.id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete user: still owns % workspace(s) [%]. Reassign or delete the workspace first.', v_count, v_names;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_users_block_delete_if_owns_workspace ON public.app_users;
CREATE TRIGGER trg_app_users_block_delete_if_owns_workspace
BEFORE DELETE ON public.app_users
FOR EACH ROW EXECUTE FUNCTION public.block_delete_workspace_owner();
