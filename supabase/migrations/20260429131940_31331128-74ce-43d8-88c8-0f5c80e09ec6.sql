REVOKE EXECUTE ON FUNCTION public.force_service_orders_auth_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.force_payment_orders_auth_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.force_financial_records_auth_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.force_clients_auth_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.force_company_settings_auth_owner() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.current_user_workspace_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_workspace_ids() TO authenticated;