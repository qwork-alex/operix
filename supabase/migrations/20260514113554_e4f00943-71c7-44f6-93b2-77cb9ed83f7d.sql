-- Add supplier fields for category, banking, and document
ALTER TABLE public.billing_suppliers
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS bank text,
  ADD COLUMN IF NOT EXISTS document_number text;

CREATE INDEX IF NOT EXISTS idx_billing_suppliers_category ON public.billing_suppliers(category);
CREATE INDEX IF NOT EXISTS idx_billing_suppliers_name ON public.billing_suppliers(name);