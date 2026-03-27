
-- Restore all missing triggers

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

CREATE OR REPLACE TRIGGER trg_link_payment_to_service
  BEFORE INSERT ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.link_payment_order_to_service_order();

CREATE OR REPLACE TRIGGER trg_sync_financial_service_orders
  AFTER INSERT OR UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_financial_records_from_orders();

CREATE OR REPLACE TRIGGER trg_sync_financial_payment_orders
  AFTER INSERT OR UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_financial_records_from_orders();

CREATE OR REPLACE TRIGGER trg_discrepancy_service_orders
  AFTER INSERT OR UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.run_discrepancy_sync_trigger();

CREATE OR REPLACE TRIGGER trg_discrepancy_payment_orders
  AFTER INSERT OR UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.run_discrepancy_sync_trigger();

CREATE OR REPLACE TRIGGER trg_log_service_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_backend_event();

CREATE OR REPLACE TRIGGER trg_log_payment_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_backend_event();

CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_name text NOT NULL DEFAULT '',
  siret text NOT NULL DEFAULT '',
  tva_number text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_settings' AND policyname = 'cs_select_own') THEN
    CREATE POLICY cs_select_own ON public.company_settings FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_settings' AND policyname = 'cs_insert_own') THEN
    CREATE POLICY cs_insert_own ON public.company_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_settings' AND policyname = 'cs_update_own') THEN
    CREATE POLICY cs_update_own ON public.company_settings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_settings' AND policyname = 'cs_delete_own') THEN
    CREATE POLICY cs_delete_own ON public.company_settings FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;
