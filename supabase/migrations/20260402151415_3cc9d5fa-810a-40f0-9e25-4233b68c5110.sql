
ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS client_name text NOT NULL DEFAULT '';

ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS technician_name text NOT NULL DEFAULT '';

ALTER TABLE public.payment_orders
ADD COLUMN IF NOT EXISTS client_name text;

ALTER TABLE public.payment_orders
ADD COLUMN IF NOT EXISTS technician_name text;
