-- Create unique index to fix ON CONFLICT error, handling nulls properly
CREATE UNIQUE INDEX IF NOT EXISTS reconciliations_so_po_unique 
ON public.reconciliations (
  COALESCE(service_order_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(payment_order_id, '00000000-0000-0000-0000-000000000000'::uuid)
);