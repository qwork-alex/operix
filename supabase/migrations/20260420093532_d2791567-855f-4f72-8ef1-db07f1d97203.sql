ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS service_order_id uuid NULL REFERENCES public.service_orders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_documents_service_order_id
ON public.documents(service_order_id);