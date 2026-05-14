
-- Create billing_clients table for the new Clients module
CREATE TABLE IF NOT EXISTS public.billing_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'professional', -- 'professional' | 'particular'
  name TEXT NOT NULL,
  -- Fiscal
  siren TEXT,
  siret TEXT,
  tva_intracom TEXT,
  tax_id TEXT, -- generic fiscal id fallback
  -- Contact
  email TEXT,
  phone TEXT,
  -- Address
  address TEXT,
  address_complement TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'France',
  -- Bank
  iban TEXT,
  bic TEXT,
  -- Multiple contacts: [{first_name, last_name, role, email, phone}]
  contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_clients_select"
  ON public.billing_clients FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role) OR (created_by = auth.uid()));

CREATE POLICY "billing_clients_insert"
  ON public.billing_clients FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "billing_clients_update"
  ON public.billing_clients FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role) OR (created_by = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role) OR (created_by = auth.uid()));

CREATE POLICY "billing_clients_delete"
  ON public.billing_clients FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role) OR (created_by = auth.uid()));

CREATE TRIGGER trg_billing_clients_updated
  BEFORE UPDATE ON public.billing_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add billing_client_id to invoices for future relationship (kept alongside supplier_id for compat)
ALTER TABLE public.billing_invoices
  ADD COLUMN IF NOT EXISTS billing_client_id UUID;

-- Add billing_client_id to attachments to attach docs directly to a client
ALTER TABLE public.billing_attachments
  ADD COLUMN IF NOT EXISTS billing_client_id UUID;

CREATE INDEX IF NOT EXISTS idx_billing_invoices_billing_client_id ON public.billing_invoices(billing_client_id);
CREATE INDEX IF NOT EXISTS idx_billing_attachments_billing_client_id ON public.billing_attachments(billing_client_id);
