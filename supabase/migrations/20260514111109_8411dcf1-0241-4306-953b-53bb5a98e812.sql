ALTER TYPE public.billing_reconciliation_status ADD VALUE IF NOT EXISTS 'divergent';
ALTER TYPE public.billing_reconciliation_status ADD VALUE IF NOT EXISTS 'analyzing';