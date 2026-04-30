-- Helper to detect deactivated (banned) users without exposing auth.users to the client.
-- A user is "active" when banned_until IS NULL or banned_until is in the past.

CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _user_id
      AND banned_until IS NOT NULL
      AND banned_until > now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_user_active(uuid) TO authenticated;

-- Returns the set of currently active (non-banned) auth user ids.
-- Used by the frontend to filter user lists / dropdowns.
CREATE OR REPLACE FUNCTION public.active_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users
  WHERE banned_until IS NULL OR banned_until <= now();
$$;

GRANT EXECUTE ON FUNCTION public.active_user_ids() TO authenticated;