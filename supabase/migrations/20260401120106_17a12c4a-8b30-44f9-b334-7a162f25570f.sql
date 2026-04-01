
CREATE TABLE public.reconciliations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_order_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL,
  payment_order_id uuid REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  matched_by text NOT NULL DEFAULT 'auto',
  confidence_score numeric NOT NULL DEFAULT 0,
  difference_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "full_access_authenticated" ON public.reconciliations
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE UNIQUE INDEX reconciliations_so_po_unique ON public.reconciliations (service_order_id, payment_order_id)
  WHERE service_order_id IS NOT NULL AND payment_order_id IS NOT NULL;
