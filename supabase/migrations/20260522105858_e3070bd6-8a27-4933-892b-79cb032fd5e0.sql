
CREATE TABLE IF NOT EXISTS public.operational_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID,
  source TEXT NOT NULL,             -- ai_alerts | discrepancies | hail_events | automation | backend_log | provider | ingest | runtime
  kind TEXT NOT NULL,               -- normalized event subtype
  severity TEXT NOT NULL DEFAULT 'info', -- info | warn | error | critical
  priority SMALLINT NOT NULL DEFAULT 50, -- 0 highest, 100 lowest
  title TEXT NOT NULL,
  detail TEXT,
  correlation_key TEXT,             -- for dedup / grouping
  ref_table TEXT,                   -- origin table when applicable
  ref_id TEXT,                      -- origin row id when applicable
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operational_events_ws_time
  ON public.operational_events (workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_events_corr
  ON public.operational_events (correlation_key) WHERE correlation_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operational_events_severity
  ON public.operational_events (severity, occurred_at DESC);

ALTER TABLE public.operational_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operational_events workspace read"
  ON public.operational_events
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid() AND m.workspace_id = operational_events.workspace_id
    )
  );

CREATE POLICY "operational_events service insert"
  ON public.operational_events
  FOR INSERT TO authenticated
  WITH CHECK (true);
