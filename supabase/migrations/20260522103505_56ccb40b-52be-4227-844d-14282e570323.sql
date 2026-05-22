SELECT cron.unschedule('ingest-hail-every-15min');
SELECT cron.schedule(
  'ingest-hail-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nwjiyfvaoogevqovnyon.supabase.co/functions/v1/ingest-hail?region=all',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53aml5ZnZhb29nZXZxb3ZueW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjY0OTgsImV4cCI6MjA4OTYwMjQ5OH0.jY0CBkWvAZ50anHe7GibIzfeAS-Q3T6hIIVq0qtkM7U'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);