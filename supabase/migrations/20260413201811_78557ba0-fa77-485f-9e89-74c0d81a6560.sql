
-- 1. Profit rules (one per technician)
CREATE TABLE public.profit_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate active rules per technician
CREATE UNIQUE INDEX idx_profit_rules_active_tech 
  ON public.profit_rules (technician_id) WHERE is_active = true;

ALTER TABLE public.profit_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_authenticated" ON public.profit_rules
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Rule items (participants + percentages)
CREATE TABLE public.profit_rule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.profit_rules(id) ON DELETE CASCADE,
  participant_name text NOT NULL,
  percentage numeric NOT NULL DEFAULT 0,
  participant_type text NOT NULL DEFAULT 'other',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profit_rule_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_authenticated" ON public.profit_rule_items
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Persisted distribution results per service order
CREATE TABLE public.service_order_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  rule_item_id uuid REFERENCES public.profit_rule_items(id) ON DELETE SET NULL,
  participant_name text NOT NULL,
  percentage numeric NOT NULL DEFAULT 0,
  calculated_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sod_service_order ON public.service_order_distributions(service_order_id);

ALTER TABLE public.service_order_distributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_authenticated" ON public.service_order_distributions
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
