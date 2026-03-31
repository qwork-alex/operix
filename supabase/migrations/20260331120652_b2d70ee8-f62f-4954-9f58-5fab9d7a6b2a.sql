
-- Table for dynamic profit distribution: defaults per role + overrides per user or per order
CREATE TABLE public.profit_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'default' CHECK (scope IN ('default', 'user', 'order')),
  target_user_id uuid,
  target_order_id uuid,
  tech_share numeric NOT NULL DEFAULT 40,
  partner_share numeric NOT NULL DEFAULT 30,
  company_share numeric NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  UNIQUE (scope, target_user_id, target_order_id)
);

ALTER TABLE public.profit_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "full_access_authenticated"
  ON public.profit_distributions
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER PUBLICATION supabase_realtime ADD TABLE public.profit_distributions;
