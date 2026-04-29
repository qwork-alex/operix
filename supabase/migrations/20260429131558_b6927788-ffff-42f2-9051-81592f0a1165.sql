CREATE OR REPLACE FUNCTION public.current_user_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT workspace_id
  FROM public.app_users
  WHERE auth_user_id = auth.uid()
    AND workspace_id IS NOT NULL
$$;

DROP POLICY IF EXISTS app_users_select_role_or_self ON public.app_users;

CREATE POLICY app_users_select_role_or_self
ON public.app_users
FOR SELECT TO authenticated
USING (
  auth_user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR workspace_id IN (SELECT public.current_user_workspace_ids())
);