
-- 1. Add missing columns to vehicles
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vin_number text,
  ADD COLUMN IF NOT EXISTS first_registration_date date,
  ADD COLUMN IF NOT EXISTS vehicle_type text DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'available';

-- 2. Create drivers table
CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  birth_date date,
  address text,
  license_category text,
  license_number text,
  license_expiry_date date,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_authenticated" ON public.drivers FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Create fleet_trips table
CREATE TABLE IF NOT EXISTS public.fleet_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  km_start numeric NOT NULL,
  km_end numeric,
  total_distance numeric GENERATED ALWAYS AS (CASE WHEN km_end IS NOT NULL AND km_end > km_start THEN km_end - km_start ELSE 0 END) STORED,
  status text NOT NULL DEFAULT 'in_progress',
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fleet_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_authenticated" ON public.fleet_trips FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Create fleet_trip_points table
CREATE TABLE IF NOT EXISTS public.fleet_trip_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.fleet_trips(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  address text,
  postal_code text,
  city text,
  latitude numeric,
  longitude numeric,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fleet_trip_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_authenticated" ON public.fleet_trip_points FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Create fleet_fuel_logs table
CREATE TABLE IF NOT EXISTS public.fleet_fuel_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  km_at_fuel numeric,
  liters numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  price_per_liter numeric GENERATED ALWAYS AS (CASE WHEN liters > 0 THEN total_cost / liters ELSE 0 END) STORED,
  receipt_storage_path text,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fleet_fuel_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_authenticated" ON public.fleet_fuel_logs FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 6. Add driver_id to vehicle_assignments for proper linking
ALTER TABLE public.vehicle_assignments
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL;
