
-- Drop ALL existing policies and replace with simple authenticated access

-- profiles
DROP POLICY IF EXISTS "profiles_delete_owner_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_owner_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_owner_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_owner_or_admin" ON public.profiles;
CREATE POLICY "full_access_authenticated" ON public.profiles FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- user_roles
DROP POLICY IF EXISTS "Admin manages roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users read own role" ON public.user_roles;
CREATE POLICY "full_access_authenticated" ON public.user_roles FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- clients
DROP POLICY IF EXISTS "clients_delete_owner_or_admin" ON public.clients;
DROP POLICY IF EXISTS "clients_insert_owner_or_admin" ON public.clients;
DROP POLICY IF EXISTS "clients_select_owner_or_admin" ON public.clients;
DROP POLICY IF EXISTS "clients_update_owner_or_admin" ON public.clients;
CREATE POLICY "full_access_authenticated" ON public.clients FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- service_orders
DROP POLICY IF EXISTS "service_orders_delete_owner_or_admin" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_insert_owner_or_admin" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_select_owner_or_admin" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_update_owner_or_admin" ON public.service_orders;
CREATE POLICY "full_access_authenticated" ON public.service_orders FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- payment_orders
DROP POLICY IF EXISTS "payment_orders_delete_owner_or_admin" ON public.payment_orders;
DROP POLICY IF EXISTS "payment_orders_insert_owner_or_admin" ON public.payment_orders;
DROP POLICY IF EXISTS "payment_orders_select_owner_or_admin" ON public.payment_orders;
DROP POLICY IF EXISTS "payment_orders_update_owner_or_admin" ON public.payment_orders;
CREATE POLICY "full_access_authenticated" ON public.payment_orders FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- financial_records
DROP POLICY IF EXISTS "financial_records_delete_owner_or_admin" ON public.financial_records;
DROP POLICY IF EXISTS "financial_records_insert_owner_or_admin" ON public.financial_records;
DROP POLICY IF EXISTS "financial_records_select_owner_or_admin" ON public.financial_records;
DROP POLICY IF EXISTS "financial_records_update_owner_or_admin" ON public.financial_records;
DROP POLICY IF EXISTS "financial_records_trigger_insert" ON public.financial_records;
CREATE POLICY "full_access_authenticated" ON public.financial_records FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- vehicles
DROP POLICY IF EXISTS "vehicles_delete_owner_or_admin" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_insert_owner_or_admin" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_select_owner_or_admin" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_update_owner_or_admin" ON public.vehicles;
CREATE POLICY "full_access_authenticated" ON public.vehicles FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- documents
DROP POLICY IF EXISTS "documents_delete_owner_or_admin" ON public.documents;
DROP POLICY IF EXISTS "documents_insert_owner_or_admin" ON public.documents;
DROP POLICY IF EXISTS "documents_select_owner_or_admin" ON public.documents;
DROP POLICY IF EXISTS "documents_update_owner_or_admin" ON public.documents;
CREATE POLICY "full_access_authenticated" ON public.documents FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Also fix related tables
-- technicians
DROP POLICY IF EXISTS "technicians_delete_owner_or_admin" ON public.technicians;
DROP POLICY IF EXISTS "technicians_insert_owner_or_admin" ON public.technicians;
DROP POLICY IF EXISTS "technicians_select_owner_or_admin" ON public.technicians;
DROP POLICY IF EXISTS "technicians_update_owner_or_admin" ON public.technicians;
CREATE POLICY "full_access_authenticated" ON public.technicians FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- company_settings
DROP POLICY IF EXISTS "cs_delete_own" ON public.company_settings;
DROP POLICY IF EXISTS "cs_insert_own" ON public.company_settings;
DROP POLICY IF EXISTS "cs_select_own" ON public.company_settings;
DROP POLICY IF EXISTS "cs_update_own" ON public.company_settings;
CREATE POLICY "full_access_authenticated" ON public.company_settings FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- discrepancies
DROP POLICY IF EXISTS "Admin full access disc" ON public.discrepancies;
DROP POLICY IF EXISTS "Authenticated read discrepancies" ON public.discrepancies;
DROP POLICY IF EXISTS "System insert discrepancies" ON public.discrepancies;
DROP POLICY IF EXISTS "System update discrepancies" ON public.discrepancies;
CREATE POLICY "full_access_authenticated" ON public.discrepancies FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- backend_event_logs
DROP POLICY IF EXISTS "Admin read backend logs" ON public.backend_event_logs;
DROP POLICY IF EXISTS "System write backend logs" ON public.backend_event_logs;
CREATE POLICY "full_access_authenticated" ON public.backend_event_logs FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- mileage_logs
DROP POLICY IF EXISTS "Admin full access ml" ON public.mileage_logs;
DROP POLICY IF EXISTS "Authenticated manage mileage" ON public.mileage_logs;
DROP POLICY IF EXISTS "Users manage own ml" ON public.mileage_logs;
CREATE POLICY "full_access_authenticated" ON public.mileage_logs FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- partner_clients
DROP POLICY IF EXISTS "Admin full access pc" ON public.partner_clients;
DROP POLICY IF EXISTS "Partners read own" ON public.partner_clients;
CREATE POLICY "full_access_authenticated" ON public.partner_clients FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- technician_clients
DROP POLICY IF EXISTS "Admin full access tc" ON public.technician_clients;
DROP POLICY IF EXISTS "Read own tc links" ON public.technician_clients;
CREATE POLICY "full_access_authenticated" ON public.technician_clients FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Restore all triggers
CREATE OR REPLACE TRIGGER trg_set_created_by_service_orders BEFORE INSERT ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();
CREATE OR REPLACE TRIGGER trg_set_created_by_payment_orders BEFORE INSERT ON public.payment_orders FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();
CREATE OR REPLACE TRIGGER trg_set_created_by_financial_records BEFORE INSERT ON public.financial_records FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();
CREATE OR REPLACE TRIGGER trg_set_created_by_vehicles BEFORE INSERT ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();
CREATE OR REPLACE TRIGGER trg_set_created_by_clients BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_created_by_from_auth();
CREATE OR REPLACE TRIGGER trg_set_uploaded_by_documents BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_uploaded_by_from_auth();
CREATE OR REPLACE TRIGGER trg_link_payment_to_service BEFORE INSERT ON public.payment_orders FOR EACH ROW EXECUTE FUNCTION public.link_payment_order_to_service_order();
CREATE OR REPLACE TRIGGER trg_sync_financial_service_orders AFTER INSERT OR UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.sync_financial_records_from_orders();
CREATE OR REPLACE TRIGGER trg_sync_financial_payment_orders AFTER INSERT OR UPDATE ON public.payment_orders FOR EACH ROW EXECUTE FUNCTION public.sync_financial_records_from_orders();
CREATE OR REPLACE TRIGGER trg_discrepancy_service_orders AFTER INSERT OR UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.run_discrepancy_sync_trigger();
CREATE OR REPLACE TRIGGER trg_discrepancy_payment_orders AFTER INSERT OR UPDATE ON public.payment_orders FOR EACH ROW EXECUTE FUNCTION public.run_discrepancy_sync_trigger();
CREATE OR REPLACE TRIGGER trg_log_service_orders AFTER INSERT OR UPDATE OR DELETE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.log_backend_event();
CREATE OR REPLACE TRIGGER trg_log_payment_orders AFTER INSERT OR UPDATE OR DELETE ON public.payment_orders FOR EACH ROW EXECUTE FUNCTION public.log_backend_event();
