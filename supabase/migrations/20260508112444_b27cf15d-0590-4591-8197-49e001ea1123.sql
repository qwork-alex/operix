
REVOKE EXECUTE ON FUNCTION public.get_user_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_context(uuid) TO authenticated;
