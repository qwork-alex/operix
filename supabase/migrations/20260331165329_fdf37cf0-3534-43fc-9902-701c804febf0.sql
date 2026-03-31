
DROP TRIGGER IF EXISTS trg_set_created_by_service_orders ON public.service_orders;
DROP TRIGGER IF EXISTS trg_set_created_by_payment_orders ON public.payment_orders;
DROP TRIGGER IF EXISTS trg_sync_financial_service_orders ON public.service_orders;
DROP TRIGGER IF EXISTS trg_sync_financial_payment_orders ON public.payment_orders;
DROP TRIGGER IF EXISTS trg_discrepancy_service_orders ON public.service_orders;
DROP TRIGGER IF EXISTS trg_discrepancy_payment_orders ON public.payment_orders;
DROP TRIGGER IF EXISTS trg_link_payment_to_service ON public.payment_orders;
DROP TRIGGER IF EXISTS trg_log_service_orders ON public.service_orders;
DROP TRIGGER IF EXISTS trg_log_payment_orders ON public.payment_orders;
DROP TRIGGER IF EXISTS trg_log_financial_records ON public.financial_records;
DROP TRIGGER IF EXISTS trg_notify_service_order ON public.service_orders;
DROP TRIGGER IF EXISTS trg_notify_payment_order ON public.payment_orders;
DROP TRIGGER IF EXISTS trg_notify_discrepancy ON public.discrepancies;
DROP TRIGGER IF EXISTS trg_set_uploaded_by_documents ON public.documents;

CREATE TRIGGER trg_set_created_by_service_orders
  BEFORE INSERT ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();

CREATE TRIGGER trg_set_created_by_payment_orders
  BEFORE INSERT ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();

CREATE TRIGGER trg_sync_financial_service_orders
  AFTER INSERT OR UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_financial_records_from_orders();

CREATE TRIGGER trg_sync_financial_payment_orders
  AFTER INSERT OR UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_financial_records_from_orders();

CREATE TRIGGER trg_discrepancy_service_orders
  AFTER INSERT OR UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.run_discrepancy_sync_trigger();

CREATE TRIGGER trg_discrepancy_payment_orders
  AFTER INSERT OR UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.run_discrepancy_sync_trigger();

CREATE TRIGGER trg_link_payment_to_service
  BEFORE INSERT ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.link_payment_order_to_service_order();

CREATE TRIGGER trg_log_service_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_backend_event();

CREATE TRIGGER trg_log_payment_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_backend_event();

CREATE TRIGGER trg_log_financial_records
  AFTER INSERT OR UPDATE OR DELETE ON public.financial_records
  FOR EACH ROW EXECUTE FUNCTION public.log_backend_event();

CREATE TRIGGER trg_notify_service_order
  AFTER INSERT ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_event();

CREATE TRIGGER trg_notify_payment_order
  AFTER INSERT ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_event();

CREATE TRIGGER trg_notify_discrepancy
  AFTER INSERT ON public.discrepancies
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_event();

CREATE TRIGGER trg_set_uploaded_by_documents
  BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_uploaded_by_from_auth();
