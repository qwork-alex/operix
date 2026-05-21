ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS commercial_status text;

COMMENT ON COLUMN public.production_orders.commercial_status IS
  'Optional commercial lifecycle state (e.g. invoiced, delivered). Decoupled from operational status. Nullable.';