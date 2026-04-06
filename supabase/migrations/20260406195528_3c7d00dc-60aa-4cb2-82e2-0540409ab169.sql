
ALTER TABLE public.documents ADD COLUMN module text NOT NULL DEFAULT 'global';

-- Backfill existing rows based on entity_type
UPDATE public.documents SET module = 'fleet' WHERE entity_type IN ('vehicle_document', 'driver_document', 'fuel_receipt', 'report');
UPDATE public.documents SET module = 'orders' WHERE entity_type IN ('service_order', 'payment_order');
