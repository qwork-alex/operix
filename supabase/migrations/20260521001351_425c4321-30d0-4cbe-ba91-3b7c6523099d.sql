REVOKE EXECUTE ON FUNCTION public.is_platform_owner(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.calc_subscription_price(integer, public.billing_cycle, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_workspace_subscription(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_platform_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calc_subscription_price(integer, public.billing_cycle, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_subscription(uuid) TO authenticated;