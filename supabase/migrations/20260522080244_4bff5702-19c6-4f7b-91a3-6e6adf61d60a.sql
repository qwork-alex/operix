-- Idempotent helper: add table to publication only if not already in
DO $$
DECLARE
  t text;
  tables_to_add text[] := ARRAY[
    'hail_reports',
    'service_orders',
    'ai_recommendations',
    'ai_alerts',
    'discrepancies',
    'automation_executions'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_add LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      -- Ensure full row payload on UPDATE/DELETE
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);

      -- Add to realtime publication if not already present
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;