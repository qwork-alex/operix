
-- Restore all critical triggers that keep getting dropped

-- 1. Auto-set created_by triggers
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

-- 2. Auto-link payment to service order
CREATE OR REPLACE TRIGGER trg_link_payment_to_service
  BEFORE INSERT ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.link_payment_order_to_service_order();

-- 3. Financial sync triggers
CREATE OR REPLACE TRIGGER trg_sync_financial_service_orders
  AFTER INSERT OR UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_financial_records_from_orders();

CREATE OR REPLACE TRIGGER trg_sync_financial_payment_orders
  AFTER INSERT OR UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_financial_records_from_orders();

-- 4. Discrepancy engine triggers
CREATE OR REPLACE TRIGGER trg_discrepancy_service_orders
  AFTER INSERT OR UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.run_discrepancy_sync_trigger();

CREATE OR REPLACE TRIGGER trg_discrepancy_payment_orders
  AFTER INSERT OR UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.run_discrepancy_sync_trigger();

-- 5. Audit log triggers
CREATE OR REPLACE TRIGGER trg_log_service_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_backend_event();

CREATE OR REPLACE TRIGGER trg_log_payment_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_backend_event();

-- 6. Ensure mileage_logs has permissive policy for authenticated users
DROP POLICY IF EXISTS "Authenticated manage mileage" ON public.mileage_logs;
CREATE POLICY "Authenticated manage mileage" ON public.mileage_logs
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (auth.uid() IS NOT NULL);
