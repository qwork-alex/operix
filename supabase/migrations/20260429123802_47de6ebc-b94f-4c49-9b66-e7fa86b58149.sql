DROP FUNCTION IF EXISTS public.set_user_id_from_auth();

REVOKE ALL ON FUNCTION public.set_service_orders_user_from_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_payment_orders_user_from_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_financial_records_user_from_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_clients_user_from_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_company_settings_user_from_auth() FROM PUBLIC, anon, authenticated;