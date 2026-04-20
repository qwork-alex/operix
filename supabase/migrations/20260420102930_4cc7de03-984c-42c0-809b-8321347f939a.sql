-- ============ 1. CLEANUP: Remove legacy columns from documents ============
ALTER TABLE public.documents DROP COLUMN IF EXISTS entity_id;
ALTER TABLE public.documents DROP COLUMN IF EXISTS entity_type;

-- ============ 2. RLS HARDENING ============

-- Helper: drop existing open policies before adding strict ones
DO $$
DECLARE
  t text;
  pol record;
  tables text[] := ARRAY[
    'payment_orders','technicians','clients','partner_clients','technician_clients',
    'profit_rules','profit_rule_items','profit_distributions','service_order_distributions',
    'reconciliations','discrepancies',
    'vehicles','drivers','vehicle_assignments','vehicle_documents','vehicle_usage_logs',
    'fleet_trips','fleet_trip_points','fleet_fuel_logs','fuel_receipts','mileage_logs',
    'company_settings','profiles','user_roles','notifications','backend_event_logs',
    'app_users','memberships','workspaces','invites','user_usage','financial_entries'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- payment_orders
CREATE POLICY "po_select_scoped" ON public.payment_orders FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner')
  OR (has_role(auth.uid(),'technician') AND technician_id IS NOT NULL AND technician_id = get_my_technician_id())
  OR (has_role(auth.uid(),'client') AND client_id IS NOT NULL AND can_access_client(auth.uid(), client_id))
);
CREATE POLICY "po_insert_admin" ON public.payment_orders FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "po_update_admin" ON public.payment_orders FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "po_delete_admin" ON public.payment_orders FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

-- technicians
CREATE POLICY "tech_select" ON public.technicians FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR user_id = auth.uid()
);
CREATE POLICY "tech_admin_all" ON public.technicians FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- clients
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner')
  OR can_access_client(auth.uid(), id)
);
CREATE POLICY "clients_admin_all" ON public.clients FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- partner_clients / technician_clients
CREATE POLICY "pc_admin_all" ON public.partner_clients FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "pc_select_self" ON public.partner_clients FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR partner_user_id = auth.uid()
);
CREATE POLICY "tc_admin_all" ON public.technician_clients FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "tc_select_self" ON public.technician_clients FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR technician_id = get_my_technician_id()
);

-- profit_rules / items / distributions / service_order_distributions
CREATE POLICY "pr_admin_partner_select" ON public.profit_rules FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner'));
CREATE POLICY "pr_admin_all" ON public.profit_rules FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "pri_admin_partner_select" ON public.profit_rule_items FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner'));
CREATE POLICY "pri_admin_all" ON public.profit_rule_items FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "pd_admin_partner_select" ON public.profit_distributions FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner'));
CREATE POLICY "pd_admin_all" ON public.profit_distributions FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "sod_admin_partner_select" ON public.service_order_distributions FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner'));
CREATE POLICY "sod_admin_all" ON public.service_order_distributions FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- reconciliations / discrepancies
CREATE POLICY "rec_admin_partner_select" ON public.reconciliations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner'));
CREATE POLICY "rec_admin_all" ON public.reconciliations FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "disc_admin_partner_select" ON public.discrepancies FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner'));
CREATE POLICY "disc_admin_all" ON public.discrepancies FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- financial_entries
CREATE POLICY "fe_admin_partner_select" ON public.financial_entries FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner'));
CREATE POLICY "fe_admin_all" ON public.financial_entries FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Fleet
CREATE POLICY "veh_select" ON public.vehicles FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner')
  OR (has_role(auth.uid(),'technician') AND assigned_technician_id = get_my_technician_id())
);
CREATE POLICY "veh_admin_all" ON public.vehicles FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "drv_select" ON public.drivers FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR has_role(auth.uid(),'technician'));
CREATE POLICY "drv_admin_all" ON public.drivers FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "va_select" ON public.vehicle_assignments FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner')
  OR EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_assignments.vehicle_id AND v.assigned_technician_id = get_my_technician_id())
);
CREATE POLICY "va_admin_all" ON public.vehicle_assignments FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "vd_select" ON public.vehicle_documents FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR has_role(auth.uid(),'technician'));
CREATE POLICY "vd_admin_all" ON public.vehicle_documents FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "vul_select" ON public.vehicle_usage_logs FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner'));
CREATE POLICY "vul_admin_all" ON public.vehicle_usage_logs FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "ft_select" ON public.fleet_trips FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner')
  OR (has_role(auth.uid(),'technician') AND driver_id IN (SELECT id FROM public.drivers WHERE created_by = auth.uid()))
  OR (has_role(auth.uid(),'technician') AND created_by = auth.uid())
);
CREATE POLICY "ft_insert_auth" ON public.fleet_trips FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "ft_update_own_or_admin" ON public.fleet_trips FOR UPDATE TO authenticated USING (
  has_role(auth.uid(),'admin') OR created_by = auth.uid()
) WITH CHECK (has_role(auth.uid(),'admin') OR created_by = auth.uid());
CREATE POLICY "ft_delete_admin" ON public.fleet_trips FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE POLICY "ftp_select" ON public.fleet_trip_points FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner')
  OR EXISTS (SELECT 1 FROM public.fleet_trips t WHERE t.id = fleet_trip_points.trip_id AND t.created_by = auth.uid())
);
CREATE POLICY "ftp_write_auth" ON public.fleet_trip_points FOR ALL TO authenticated USING (
  has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.fleet_trips t WHERE t.id = fleet_trip_points.trip_id AND t.created_by = auth.uid())
) WITH CHECK (
  has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.fleet_trips t WHERE t.id = fleet_trip_points.trip_id AND t.created_by = auth.uid())
);

CREATE POLICY "ffl_select" ON public.fleet_fuel_logs FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid());
CREATE POLICY "ffl_write" ON public.fleet_fuel_logs FOR ALL TO authenticated USING (has_role(auth.uid(),'admin') OR created_by = auth.uid()) WITH CHECK (has_role(auth.uid(),'admin') OR created_by = auth.uid());

CREATE POLICY "fr2_select" ON public.fuel_receipts FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner'));
CREATE POLICY "fr2_admin_all" ON public.fuel_receipts FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "ml_select" ON public.mileage_logs FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR driver_user_id = auth.uid());
CREATE POLICY "ml_admin_all" ON public.mileage_logs FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- company_settings
CREATE POLICY "cs_select_auth" ON public.company_settings FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "cs_admin_all" ON public.company_settings FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- profiles: own + admin
CREATE POLICY "prof_select_auth" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "prof_update_self_or_admin" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR has_role(auth.uid(),'admin')) WITH CHECK (id = auth.uid() OR has_role(auth.uid(),'admin'));
CREATE POLICY "prof_insert_self_or_admin" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid() OR has_role(auth.uid(),'admin'));
CREATE POLICY "prof_delete_admin" ON public.profiles FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

-- user_roles
CREATE POLICY "ur_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'));
CREATE POLICY "ur_admin_all" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- notifications
CREATE POLICY "notif_select_own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'));
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notif_insert_auth" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "notif_delete_own_or_admin" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'));

-- backend_event_logs
CREATE POLICY "bel_select_admin" ON public.backend_event_logs FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "bel_insert_auth" ON public.backend_event_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- app_users / memberships / workspaces / invites / user_usage
CREATE POLICY "au_select_self_or_admin" ON public.app_users FOR SELECT TO authenticated USING (auth_user_id = auth.uid() OR has_role(auth.uid(),'admin'));
CREATE POLICY "au_admin_all" ON public.app_users FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "au_insert_self" ON public.app_users FOR INSERT TO authenticated WITH CHECK (auth_user_id = auth.uid() OR has_role(auth.uid(),'admin'));

CREATE POLICY "mem_select_self_or_admin" ON public.memberships FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.app_users a WHERE a.id = memberships.user_id AND a.auth_user_id = auth.uid())
);
CREATE POLICY "mem_admin_all" ON public.memberships FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "ws_select_member_or_admin" ON public.workspaces FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.memberships m JOIN public.app_users a ON a.id = m.user_id WHERE m.workspace_id = workspaces.id AND a.auth_user_id = auth.uid())
);
CREATE POLICY "ws_admin_all" ON public.workspaces FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "inv_select_admin" ON public.invites FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "inv_insert_admin" ON public.invites FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "inv_update_auth" ON public.invites FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "uu_select_self_or_admin" ON public.user_usage FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'));
CREATE POLICY "uu_system_all" ON public.user_usage FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- ============ 3. AUDIT TRIGGERS ============
DO $$
DECLARE t text;
DECLARE tables text[] := ARRAY['service_orders','payment_orders','financial_records','user_permissions','role_permissions','user_roles','vehicles','drivers','profit_rules'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_backend_event()', t, t);
  END LOOP;
END $$;

-- ============ 4. PERFORMANCE INDEXES ============
CREATE INDEX IF NOT EXISTS idx_so_technician_id ON public.service_orders(technician_id);
CREATE INDEX IF NOT EXISTS idx_so_client_id ON public.service_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_so_group_id ON public.service_orders(group_id);
CREATE INDEX IF NOT EXISTS idx_po_technician_id ON public.payment_orders(technician_id);
CREATE INDEX IF NOT EXISTS idx_po_client_id ON public.payment_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_po_group_id ON public.payment_orders(group_id);
CREATE INDEX IF NOT EXISTS idx_po_service_order_id ON public.payment_orders(service_order_id);
CREATE INDEX IF NOT EXISTS idx_doc_service_order_id ON public.documents(service_order_id);
CREATE INDEX IF NOT EXISTS idx_fr_service_order_id ON public.financial_records(service_order_id);
CREATE INDEX IF NOT EXISTS idx_fr_payment_order_id ON public.financial_records(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_perm_user_id ON public.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_perm_perm_id ON public.user_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_role_perm_role ON public.role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_perm_perm_id ON public.role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_tech_user_id ON public.technicians(user_id);
CREATE INDEX IF NOT EXISTS idx_va_driver_id ON public.vehicle_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_va_vehicle_id ON public.vehicle_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_ft_driver_id ON public.fleet_trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_ft_vehicle_id ON public.fleet_trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_ftp_trip_id ON public.fleet_trip_points(trip_id);
CREATE INDEX IF NOT EXISTS idx_disc_so_id ON public.discrepancies(service_order_id);
CREATE INDEX IF NOT EXISTS idx_notif_user_id ON public.notifications(user_id) WHERE is_read = false;