
-- QWork Nexus Phase 1 Schema

-- 1. Role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'partner', 'technician', 'client');

-- 2. User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- 5. Technicians
CREATE TABLE public.technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

-- 6. Technician-Client link
CREATE TABLE public.technician_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID REFERENCES public.technicians(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  UNIQUE (technician_id, client_id)
);
ALTER TABLE public.technician_clients ENABLE ROW LEVEL SECURITY;

-- 7. Partner-Client link
CREATE TABLE public.partner_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  UNIQUE (partner_user_id, client_id)
);
ALTER TABLE public.partner_clients ENABLE ROW LEVEL SECURITY;

-- 8. Service Orders
CREATE TABLE public.service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  platform TEXT,
  technician_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
  week TEXT,
  car_name TEXT,
  license_plate TEXT,
  service_1_name TEXT,
  service_1_price NUMERIC(10,2) DEFAULT 0,
  service_2_name TEXT,
  service_2_price NUMERIC(10,2) DEFAULT 0,
  service_3_name TEXT,
  service_3_price NUMERIC(10,2) DEFAULT 0,
  service_4_name TEXT,
  service_4_price NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

-- 9. Payment Orders
CREATE TABLE public.payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  platform TEXT,
  list_name TEXT,
  technician_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
  car_name TEXT,
  license_plate TEXT,
  services JSONB DEFAULT '[]'::jsonb,
  total NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

-- 10. Financial Records
CREATE TABLE public.financial_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  reference_id UUID,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_records ENABLE ROW LEVEL SECURITY;

-- 11. Discrepancies
CREATE TABLE public.discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  payment_order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  issue_type TEXT NOT NULL,
  expected_value NUMERIC(12,2),
  received_value NUMERIC(12,2),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.discrepancies ENABLE ROW LEVEL SECURITY;

-- 12. Vehicles
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  license_plate TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  year INTEGER,
  assigned_technician_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
  insurance_expiry DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- 13. Mileage Logs
CREATE TABLE public.mileage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
  driver_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_km NUMERIC(10,1) NOT NULL,
  end_km NUMERIC(10,1) NOT NULL,
  fuel_litres NUMERIC(6,2),
  fuel_cost NUMERIC(8,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mileage_logs ENABLE ROW LEVEL SECURITY;

-- 14. Documents
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'file',
  parent_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  storage_path TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECURITY DEFINER FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_access_client(_user_id UUID, _client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR EXISTS (SELECT 1 FROM public.partner_clients WHERE partner_user_id = _user_id AND client_id = _client_id)
    OR EXISTS (
      SELECT 1 FROM public.technician_clients tc
      JOIN public.technicians t ON t.id = tc.technician_id
      WHERE t.user_id = _user_id AND tc.client_id = _client_id
    )
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- RLS POLICIES
-- =============================================

-- user_roles
CREATE POLICY "Users read own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admin manages roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- profiles
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admin reads all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- clients
CREATE POLICY "Admin full access clients" ON public.clients FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users read assigned clients" ON public.clients FOR SELECT USING (public.can_access_client(auth.uid(), id));

-- technicians
CREATE POLICY "Admin full access technicians" ON public.technicians FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Technicians read own" ON public.technicians FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Partners read linked technicians" ON public.technicians FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.technician_clients tc
    JOIN public.partner_clients pc ON pc.client_id = tc.client_id
    WHERE tc.technician_id = technicians.id AND pc.partner_user_id = auth.uid()
  )
);

-- technician_clients
CREATE POLICY "Admin full access tc" ON public.technician_clients FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Read own tc links" ON public.technician_clients FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = technician_id AND t.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.partner_clients pc WHERE pc.client_id = client_id AND pc.partner_user_id = auth.uid())
);

-- partner_clients
CREATE POLICY "Admin full access pc" ON public.partner_clients FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Partners read own" ON public.partner_clients FOR SELECT USING (partner_user_id = auth.uid());

-- service_orders
CREATE POLICY "Admin full access so" ON public.service_orders FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users read assigned so" ON public.service_orders FOR SELECT USING (
  public.can_access_client(auth.uid(), client_id)
  OR EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = technician_id AND t.user_id = auth.uid())
);

-- payment_orders
CREATE POLICY "Admin full access po" ON public.payment_orders FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users read assigned po" ON public.payment_orders FOR SELECT USING (
  public.can_access_client(auth.uid(), client_id)
  OR EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = technician_id AND t.user_id = auth.uid())
);

-- financial_records
CREATE POLICY "Admin full access fr" ON public.financial_records FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Partners read fr" ON public.financial_records FOR SELECT USING (public.has_role(auth.uid(), 'partner'));

-- discrepancies
CREATE POLICY "Admin full access disc" ON public.discrepancies FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- vehicles
CREATE POLICY "Admin full access vehicles" ON public.vehicles FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Technicians read assigned vehicles" ON public.vehicles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = assigned_technician_id AND t.user_id = auth.uid())
);

-- mileage_logs
CREATE POLICY "Admin full access ml" ON public.mileage_logs FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users manage own ml" ON public.mileage_logs FOR ALL USING (driver_user_id = auth.uid());

-- documents
CREATE POLICY "Admin full access docs" ON public.documents FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Auth users read docs" ON public.documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert docs" ON public.documents FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', false);

CREATE POLICY "Auth users upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'uploads');
CREATE POLICY "Auth users read uploads" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'uploads');
CREATE POLICY "Admin delete uploads" ON storage.objects FOR DELETE USING (bucket_id = 'uploads' AND public.has_role(auth.uid(), 'admin'));
