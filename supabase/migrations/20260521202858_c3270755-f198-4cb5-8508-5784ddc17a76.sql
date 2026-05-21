-- AI Orchestrator Infrastructure (SAFE MODE — no tenancy/auth/RBAC changes)

CREATE TABLE IF NOT EXISTS public.ai_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  task text NOT NULL,
  context_hash text NOT NULL,
  model text NOT NULL,
  result jsonb NOT NULL,
  explanation jsonb,
  confidence numeric,
  tokens_in int,
  tokens_out int,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour',
  UNIQUE (workspace_id, task, context_hash)
);
CREATE INDEX IF NOT EXISTS ai_cache_lookup_idx ON public.ai_cache (workspace_id, task, context_hash, expires_at);

CREATE TABLE IF NOT EXISTS public.ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  category text NOT NULL,
  entity_type text,
  entity_id uuid,
  title text NOT NULL,
  body text,
  reasoning jsonb,
  confidence numeric,
  status text NOT NULL DEFAULT 'pending',
  applied_at timestamptz,
  applied_by uuid,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_reco_ws_idx ON public.ai_recommendations (workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  kind text NOT NULL,
  scope text,
  title text NOT NULL,
  summary text,
  data jsonb,
  reasoning jsonb,
  confidence numeric,
  severity text NOT NULL DEFAULT 'info',
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_insights_ws_idx ON public.ai_insights (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warn',
  entity_type text,
  entity_id uuid,
  title text NOT NULL,
  message text,
  reasoning jsonb,
  confidence numeric,
  status text NOT NULL DEFAULT 'open',
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_alerts_ws_idx ON public.ai_alerts (workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid,
  subject_label text,
  metric text NOT NULL,
  score numeric NOT NULL,
  band text,
  reasoning jsonb,
  confidence numeric,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_scores_ws_idx ON public.ai_scores (workspace_id, subject_type, metric, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid,
  action text NOT NULL,
  recommendation_id uuid,
  payload jsonb,
  status text NOT NULL,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_action_log_ws_idx ON public.ai_action_log (workspace_id, created_at DESC);

ALTER TABLE public.ai_cache           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_alerts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_action_log      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'ai_cache','ai_recommendations','ai_insights','ai_alerts','ai_scores','ai_action_log'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_select" ON public.%1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_modify" ON public.%1$s;', t);
    EXECUTE format($p$CREATE POLICY "%1$s_select" ON public.%1$s FOR SELECT USING (public.is_workspace_member(workspace_id));$p$, t);
    EXECUTE format($p$CREATE POLICY "%1$s_modify" ON public.%1$s FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));$p$, t);
  END LOOP;
END $$;