
-- Add profit distribution columns to company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS tech_share numeric NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS partner_share numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS company_share numeric NOT NULL DEFAULT 30;

-- Restore all critical triggers that are missing

-- Ownership triggers
CREATE OR REPLACE TRIGGER trg_set_created_by_service_orders
  BEFORE INSERT ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();

CREATE OR REPLACE TRIGGER trg_set_created_by_payment_orders
  BEFORE INSERT ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();

CREATE OR REPLACE TRIGGER trg_set_created_by_financial_records
  BEFORE INSERT ON public.financial_records
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();

CREATE OR REPLACE TRIGGER trg_set_created_by_vehicles
  BEFORE INSERT ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();

CREATE OR REPLACE TRIGGER trg_set_created_by_clients
  BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();

CREATE OR REPLACE TRIGGER trg_set_uploaded_by_documents
  BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_uploaded_by_from_auth();

-- Link payment to service order
CREATE OR REPLACE TRIGGER trg_link_payment_to_service
  BEFORE INSERT ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.link_payment_order_to_service_order();

-- Financial sync triggers
CREATE OR REPLACE TRIGGER trg_sync_financial_service_orders
  AFTER INSERT OR UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_financial_records_from_orders();

CREATE OR REPLACE TRIGGER trg_sync_financial_payment_orders
  AFTER INSERT OR UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_financial_records_from_orders();

-- Discrepancy triggers
CREATE OR REPLACE TRIGGER trg_discrepancy_service_orders
  AFTER INSERT OR UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.run_discrepancy_sync_trigger();

CREATE OR REPLACE TRIGGER trg_discrepancy_payment_orders
  AFTER INSERT OR UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.run_discrepancy_sync_trigger();

-- Audit log triggers
CREATE OR REPLACE TRIGGER trg_log_service_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_backend_event();

CREATE OR REPLACE TRIGGER trg_log_payment_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_backend_event();
