ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS operational_unit text;
ALTER TABLE public.payment_orders  ADD COLUMN IF NOT EXISTS operational_unit text;
CREATE INDEX IF NOT EXISTS idx_so_operational_unit ON public.service_orders (operational_unit);
CREATE INDEX IF NOT EXISTS idx_po_operational_unit ON public.payment_orders (operational_unit);