-- Phase 6D Step 1 — Safe additive schema for real invoice engine

-- 1. Extend platform_invoices (additive only)
ALTER TABLE public.platform_invoices
  ADD COLUMN IF NOT EXISTS bank_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS vat_mode text;

-- 2. Invoice events (audit log)
CREATE TABLE IF NOT EXISTS public.invoice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.platform_invoices(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_events_invoice ON public.invoice_events(invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_events_workspace ON public.invoice_events(workspace_id, created_at DESC);

ALTER TABLE public.invoice_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_events_read_workspace"
  ON public.invoice_events FOR SELECT
  TO authenticated
  USING (
    is_platform_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.workspace_id = invoice_events.workspace_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

-- 3. Invoice email queue
CREATE TABLE IF NOT EXISTS public.invoice_email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.platform_invoices(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  recipient text NOT NULL,
  template text NOT NULL DEFAULT 'invoice-issued',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','dlq')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_email_queue_status ON public.invoice_email_queue(status, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_invoice_email_queue_invoice ON public.invoice_email_queue(invoice_id);

ALTER TABLE public.invoice_email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_email_queue_read_workspace"
  ON public.invoice_email_queue FOR SELECT
  TO authenticated
  USING (
    is_platform_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.workspace_id = invoice_email_queue.workspace_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

-- 4. Storage bucket for invoice PDFs (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-pdfs', 'invoice-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Workspace members can read their workspace folder (files stored under {workspace_id}/{invoice_id}.pdf)
CREATE POLICY "invoice_pdfs_read_workspace"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoice-pdfs'
    AND (
      is_platform_owner(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.workspace_id::text = (storage.foldername(name))[1]
          AND m.user_id = auth.uid()
          AND m.status = 'active'
      )
    )
  );

-- 5. updated_at trigger for queue
CREATE OR REPLACE FUNCTION public.invoice_email_queue_touch_updated()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_invoice_email_queue_updated ON public.invoice_email_queue;
CREATE TRIGGER trg_invoice_email_queue_updated
  BEFORE UPDATE ON public.invoice_email_queue
  FOR EACH ROW EXECUTE FUNCTION public.invoice_email_queue_touch_updated();