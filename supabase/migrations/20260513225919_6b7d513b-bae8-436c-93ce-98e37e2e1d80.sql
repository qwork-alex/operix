
-- ────────────────────────────────────────────────────────────
-- BILLING MODULE — full schema
-- ────────────────────────────────────────────────────────────

-- Enums
DO $$ BEGIN
  CREATE TYPE public.billing_invoice_status AS ENUM ('draft','pending','partial','paid','overdue','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_invoice_type AS ENUM ('incoming','outgoing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_payment_status AS ENUM ('pending','confirmed','failed','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_reconciliation_status AS ENUM ('pending','matched','partial','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── SUPPLIERS ──
CREATE TABLE IF NOT EXISTS public.billing_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tax_id TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_suppliers_name ON public.billing_suppliers(name);
CREATE INDEX IF NOT EXISTS idx_billing_suppliers_tax_id ON public.billing_suppliers(tax_id);
CREATE INDEX IF NOT EXISTS idx_billing_suppliers_created_by ON public.billing_suppliers(created_by);

-- ── PAYMENT METHODS ──
CREATE TABLE IF NOT EXISTS public.billing_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RECONCILIATIONS ──
CREATE TABLE IF NOT EXISTS public.billing_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT,
  reconciliation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status public.billing_reconciliation_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_reconciliations_status ON public.billing_reconciliations(status);
CREATE INDEX IF NOT EXISTS idx_billing_reconciliations_date ON public.billing_reconciliations(reconciliation_date DESC);

-- ── INVOICES ──
CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL,
  type public.billing_invoice_type NOT NULL DEFAULT 'incoming',
  supplier_id UUID REFERENCES public.billing_suppliers(id) ON DELETE SET NULL,
  customer_name TEXT,
  vehicle_id UUID,
  fleet_id UUID,
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  remaining_amount NUMERIC GENERATED ALWAYS AS (COALESCE(total_amount,0) - COALESCE(paid_amount,0)) STORED,
  status public.billing_invoice_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_supplier ON public.billing_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_so ON public.billing_invoices(service_order_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON public.billing_invoices(status);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_due ON public.billing_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_created_by ON public.billing_invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_number ON public.billing_invoices(invoice_number);

-- ── INVOICE ITEMS ──
CREATE TABLE IF NOT EXISTS public.billing_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.billing_invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  vat_rate NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_invoice_items_invoice ON public.billing_invoice_items(invoice_id);

-- ── PAYMENTS ──
CREATE TABLE IF NOT EXISTS public.billing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.billing_invoices(id) ON DELETE CASCADE,
  payment_method_id UUID REFERENCES public.billing_payment_methods(id) ON DELETE SET NULL,
  reconciliation_id UUID REFERENCES public.billing_reconciliations(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  status public.billing_payment_status NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_payments_invoice ON public.billing_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_payments_recon ON public.billing_payments(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_billing_payments_date ON public.billing_payments(payment_date DESC);

-- ── ATTACHMENTS ──
CREATE TABLE IF NOT EXISTS public.billing_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.billing_invoices(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.billing_payments(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.billing_suppliers(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_attachments_invoice ON public.billing_attachments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_attachments_payment ON public.billing_attachments(payment_id);
CREATE INDEX IF NOT EXISTS idx_billing_attachments_supplier ON public.billing_attachments(supplier_id);

-- ────────────────────────────────────────────────────────────
-- updated_at triggers
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TRIGGER trg_billing_suppliers_updated      BEFORE UPDATE ON public.billing_suppliers      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_billing_payment_methods_updated BEFORE UPDATE ON public.billing_payment_methods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_billing_invoices_updated       BEFORE UPDATE ON public.billing_invoices       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_billing_payments_updated       BEFORE UPDATE ON public.billing_payments       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_billing_reconciliations_updated BEFORE UPDATE ON public.billing_reconciliations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;

-- Fallback updated_at function in case it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ────────────────────────────────────────────────────────────
-- RLS — admin/partner full access; others see own rows only
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.billing_suppliers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoice_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_attachments     ENABLE ROW LEVEL SECURITY;

-- Helper inline expression used: has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid()

-- SUPPLIERS
CREATE POLICY billing_suppliers_select ON public.billing_suppliers FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid());
CREATE POLICY billing_suppliers_insert ON public.billing_suppliers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY billing_suppliers_update ON public.billing_suppliers FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid())
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid());
CREATE POLICY billing_suppliers_delete ON public.billing_suppliers FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid());

-- PAYMENT METHODS
CREATE POLICY billing_payment_methods_select ON public.billing_payment_methods FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY billing_payment_methods_admin ON public.billing_payment_methods FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid())
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid());

-- INVOICES
CREATE POLICY billing_invoices_select ON public.billing_invoices FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid());
CREATE POLICY billing_invoices_insert ON public.billing_invoices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY billing_invoices_update ON public.billing_invoices FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid())
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid());
CREATE POLICY billing_invoices_delete ON public.billing_invoices FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid());

-- INVOICE ITEMS — inherit access from parent invoice
CREATE POLICY billing_invoice_items_select ON public.billing_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.billing_invoices i WHERE i.id = invoice_id
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR i.created_by = auth.uid())));
CREATE POLICY billing_invoice_items_write ON public.billing_invoice_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.billing_invoices i WHERE i.id = invoice_id
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR i.created_by = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.billing_invoices i WHERE i.id = invoice_id
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR i.created_by = auth.uid())));

-- PAYMENTS
CREATE POLICY billing_payments_select ON public.billing_payments FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid());
CREATE POLICY billing_payments_insert ON public.billing_payments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY billing_payments_update ON public.billing_payments FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid())
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid());
CREATE POLICY billing_payments_delete ON public.billing_payments FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid());

-- RECONCILIATIONS
CREATE POLICY billing_reconciliations_select ON public.billing_reconciliations FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid());
CREATE POLICY billing_reconciliations_insert ON public.billing_reconciliations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY billing_reconciliations_update ON public.billing_reconciliations FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid())
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid());
CREATE POLICY billing_reconciliations_delete ON public.billing_reconciliations FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR created_by = auth.uid());

-- ATTACHMENTS
CREATE POLICY billing_attachments_select ON public.billing_attachments FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR uploaded_by = auth.uid());
CREATE POLICY billing_attachments_insert ON public.billing_attachments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY billing_attachments_update ON public.billing_attachments FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR uploaded_by = auth.uid())
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR uploaded_by = auth.uid());
CREATE POLICY billing_attachments_delete ON public.billing_attachments FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR uploaded_by = auth.uid());
