-- Remove eventual job antigo com o mesmo nome (idempotência)
DO $$
BEGIN
  PERFORM cron.unschedule('ingest-hail-every-15min')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingest-hail-every-15min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Agenda chamada à edge function a cada 15 minutos
SELECT cron.schedule(
  'ingest-hail-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nwjiyfvaoogevqovnyon.supabase.co/functions/v1/ingest-hail',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53aml5ZnZhb29nZXZxb3ZueW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjY0OTgsImV4cCI6MjA4OTYwMjQ5OH0.jY0CBkWvAZ50anHe7GibIzfeAS-Q3T6hIIVq0qtkM7U'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Dispara uma execução imediata para repovoar agora
SELECT net.http_post(
  url := 'https://nwjiyfvaoogevqovnyon.supabase.co/functions/v1/ingest-hail',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53aml5ZnZhb29nZXZxb3ZueW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjY0OTgsImV4cCI6MjA4OTYwMjQ5OH0.jY0CBkWvAZ50anHe7GibIzfeAS-Q3T6hIIVq0qtkM7U'
  ),
  body := '{}'::jsonb
);