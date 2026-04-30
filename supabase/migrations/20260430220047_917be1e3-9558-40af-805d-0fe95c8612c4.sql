REVOKE EXECUTE ON FUNCTION public.effective_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_effective_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.effective_role(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.current_user_effective_role() TO authenticated;