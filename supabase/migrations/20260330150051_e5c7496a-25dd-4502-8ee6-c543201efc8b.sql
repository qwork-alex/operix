
-- Clean up duplicate triggers from older migrations
DROP TRIGGER IF EXISTS trg_sync_discrepancy_from_service_orders ON public.service_orders;
DROP TRIGGER IF EXISTS trg_sync_discrepancy_from_payment_orders ON public.payment_orders;
DROP TRIGGER IF EXISTS trg_sync_financial_from_service_orders ON public.service_orders;
DROP TRIGGER IF EXISTS trg_sync_financial_from_payment_orders ON public.payment_orders;
DROP TRIGGER IF EXISTS trg_link_payment_order_to_service_order ON public.payment_orders;
DROP TRIGGER IF EXISTS trg_log_financial_records ON public.financial_records;
