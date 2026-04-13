
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS technician_percentage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS technician_earning numeric DEFAULT 0;
