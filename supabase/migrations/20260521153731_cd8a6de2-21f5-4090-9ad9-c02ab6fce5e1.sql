
-- Phase 6E: cron + dunning emails + event log indexes
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Index for event timeline reads
CREATE INDEX IF NOT EXISTS idx_subscription_events_ws_created
  ON public.subscription_events (workspace_id, created_at DESC);

-- Add notified_at tracking column
ALTER TABLE public.dunning_events
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

-- Trigger: enqueue dunning email when dunning_event inserted
CREATE OR REPLACE FUNCTION public.enqueue_dunning_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_template text;
BEGIN
  -- recipient
  SELECT billing_email INTO v_email
  FROM billing_profiles
  WHERE workspace_id = NEW.workspace_id;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN NEW;
  END IF;

  v_template := 'dunning-' || NEW.stage;

  -- only enqueue if invoice_id present (queue requires FK)
  IF NEW.invoice_id IS NOT NULL THEN
    INSERT INTO invoice_email_queue (
      invoice_id, workspace_id, recipient, template, status, scheduled_at
    ) VALUES (
      NEW.invoice_id, NEW.workspace_id, v_email, v_template, 'pending', now()
    );
  END IF;

  -- always log
  PERFORM log_subscription_event(
    NEW.workspace_id,
    'dunning.' || NEW.stage,
    CASE NEW.stage
      WHEN 'reminder' THEN 'info'
      WHEN 'warning' THEN 'warning'
      WHEN 'limited_mode' THEN 'warning'
      WHEN 'suspension' THEN 'critical'
      ELSE 'info'
    END,
    'Dunning ' || NEW.stage || ' triggered (' || NEW.days_overdue || ' days overdue)',
    jsonb_build_object('invoice_id', NEW.invoice_id, 'days_overdue', NEW.days_overdue)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dunning_email_enqueue ON public.dunning_events;
CREATE TRIGGER trg_dunning_email_enqueue
  AFTER INSERT ON public.dunning_events
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_dunning_email();

-- Schedule daily billing automation at 03:00 UTC
DO $$
BEGIN
  PERFORM cron.unschedule('billing-automation-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'billing-automation-daily',
  '0 3 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://nwjiyfvaoogevqovnyon.supabase.co/functions/v1/run-billing-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53aml5ZnZhb29nZXZxb3ZueW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjY0OTgsImV4cCI6MjA4OTYwMjQ5OH0.jY0CBkWvAZ50anHe7GibIzfeAS-Q3T6hIIVq0qtkM7U'
    ),
    body := jsonb_build_object('source', 'cron', 'time', now())
  );
  $cron$
);

-- Schedule invoice email dispatcher every 5 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('invoice-emails-dispatch');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'invoice-emails-dispatch',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://nwjiyfvaoogevqovnyon.supabase.co/functions/v1/process-invoice-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53aml5ZnZhb29nZXZxb3ZueW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjY0OTgsImV4cCI6MjA4OTYwMjQ5OH0.jY0CBkWvAZ50anHe7GibIzfeAS-Q3T6hIIVq0qtkM7U'
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $cron$
);
