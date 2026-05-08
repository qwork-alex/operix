
-- Phase B1: Canonical RBAC helper functions
-- Zero risk: only adds functions, no policy changes.

-- 1. is_order_visible: encapsulates current SELECT rule for SO/PO/financial_records
CREATE OR REPLACE FUNCTION public.is_order_visible(
  _uid uuid,
  _user_id uuid,
  _assigned uuid,
  _created_by uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _uid IS NOT NULL
    AND public.is_user_active(_uid)
    AND (
      public.has_role(_uid, 'admin'::public.app_role)
      OR public.has_role(_uid, 'partner'::public.app_role)
      OR _user_id = _uid
      OR _assigned = _uid
      OR _created_by = _uid
    );
$$;

-- 2. is_order_writable: admin/partner OR row.user_id = uid
CREATE OR REPLACE FUNCTION public.is_order_writable(
  _uid uuid,
  _user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _uid IS NOT NULL
    AND public.is_user_active(_uid)
    AND (
      public.has_role(_uid, 'admin'::public.app_role)
      OR public.has_role(_uid, 'partner'::public.app_role)
      OR _user_id = _uid
    );
$$;

-- 3. owner_filter_uids: array of uids the user can see "as owner"
--    Today = [_uid]; future expansion to teams/groups without changing callers.
CREATE OR REPLACE FUNCTION public.owner_filter_uids(_uid uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _uid IS NULL THEN ARRAY[]::uuid[]
    WHEN public.has_role(_uid, 'admin'::public.app_role)
      OR public.has_role(_uid, 'partner'::public.app_role)
      THEN NULL::uuid[]  -- NULL = no filter (sees all). Callers must treat NULL as "no restriction".
    ELSE ARRAY[_uid]
  END;
$$;

-- 4. assert_active: hard block in triggers for banned users
CREATE OR REPLACE FUNCTION public.assert_active(_uid uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_user_active(_uid) THEN
    RAISE EXCEPTION 'User % is not active.', _uid USING ERRCODE = '28000';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_order_visible(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_order_writable(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_filter_uids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_active(uuid) TO authenticated;

-- B1 validation log
INSERT INTO public.rls_validation_logs(phase, check_name, sample)
VALUES (
  'B1',
  'helpers_created',
  jsonb_build_object(
    'functions', jsonb_build_array(
      'is_order_visible(uuid,uuid,uuid,uuid)',
      'is_order_writable(uuid,uuid)',
      'owner_filter_uids(uuid)',
      'assert_active(uuid)'
    ),
    'policies_changed', 0
  )
);
