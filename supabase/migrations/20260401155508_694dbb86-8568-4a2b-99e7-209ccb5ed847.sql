
-- Add fuel_type and power to vehicles
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS fuel_type text DEFAULT null;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS power text DEFAULT null;

-- Vehicle documents
CREATE TABLE public.vehicle_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  storage_path text,
  file_name text NOT NULL DEFAULT '',
  doc_type text NOT NULL DEFAULT 'outros',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_authenticated" ON public.vehicle_documents FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Vehicle assignments
CREATE TABLE public.vehicle_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_name text NOT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status text NOT NULL DEFAULT 'em_uso',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.vehicle_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_authenticated" ON public.vehicle_assignments FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Vehicle usage logs
CREATE TABLE public.vehicle_usage_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_name text NOT NULL DEFAULT '',
  km_start numeric NOT NULL,
  km_end numeric NOT NULL,
  distance numeric GENERATED ALWAYS AS (km_end - km_start) STORED,
  start_location text,
  end_location text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  fuel_cost numeric DEFAULT 0,
  liters numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.vehicle_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_authenticated" ON public.vehicle_usage_logs FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Fuel receipts
CREATE TABLE public.fuel_receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usage_log_id uuid NOT NULL REFERENCES public.vehicle_usage_logs(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  storage_path text,
  file_name text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.fuel_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_authenticated" ON public.fuel_receipts FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
