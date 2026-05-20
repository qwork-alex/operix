
ALTER VIEW public.recoverable_items SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.soft_delete_record(text, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.restore_record(text, uuid)            FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_recoverable_items()              FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_audit_events(int, text)          FROM anon, public;

GRANT EXECUTE ON FUNCTION public.soft_delete_record(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_record(text, uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_recoverable_items()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_audit_events(int, text)          TO authenticated;
