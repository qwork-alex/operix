ALTER TABLE public.invoice_send_log
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'initial';

CREATE INDEX IF NOT EXISTS idx_invoice_send_log_invoice_kind
  ON public.invoice_send_log (invoice_id, kind, created_at DESC);