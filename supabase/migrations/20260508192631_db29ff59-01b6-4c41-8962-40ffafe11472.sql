
REVOKE EXECUTE ON FUNCTION public.is_order_visible(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_order_writable(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owner_filter_uids(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assert_active(uuid) FROM PUBLIC, anon;
