
DO $$ BEGIN
  CREATE TYPE public.platform_state AS ENUM ('active','paused','archived','degraded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  state public.platform_state NOT NULL DEFAULT 'active',
  color text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_heartbeat_at timestamptz,
  last_ingest_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_platforms_ws ON public.platforms(workspace_id);
CREATE INDEX IF NOT EXISTS idx_platforms_state ON public.platforms(state);

CREATE TABLE IF NOT EXISTS public.platform_state_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id uuid NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  from_state public.platform_state,
  to_state public.platform_state NOT NULL,
  changed_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_psl_platform ON public.platform_state_log(platform_id, created_at DESC);

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS platform_id uuid REFERENCES public.platforms(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_so_platform_id ON public.service_orders(platform_id);

ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_state_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platforms_ws_select" ON public.platforms;
CREATE POLICY "platforms_ws_select" ON public.platforms FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "platforms_ws_insert" ON public.platforms;
CREATE POLICY "platforms_ws_insert" ON public.platforms FOR INSERT
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "platforms_ws_update" ON public.platforms;
CREATE POLICY "platforms_ws_update" ON public.platforms FOR UPDATE
  USING (public.is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "platforms_ws_delete" ON public.platforms;
CREATE POLICY "platforms_ws_delete" ON public.platforms FOR DELETE
  USING (public.is_workspace_member(auth.uid(), workspace_id) AND public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "psl_ws_select" ON public.platform_state_log;
CREATE POLICY "psl_ws_select" ON public.platform_state_log FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "psl_ws_insert" ON public.platform_state_log;
CREATE POLICY "psl_ws_insert" ON public.platform_state_log FOR INSERT
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE OR REPLACE FUNCTION public.log_platform_state_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND OLD.state IS DISTINCT FROM NEW.state THEN
    INSERT INTO public.platform_state_log(platform_id, workspace_id, from_state, to_state, changed_by)
    VALUES (NEW.id, NEW.workspace_id, OLD.state, NEW.state, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_platforms_state_log ON public.platforms;
CREATE TRIGGER trg_platforms_state_log
  BEFORE UPDATE ON public.platforms
  FOR EACH ROW EXECUTE FUNCTION public.log_platform_state_change();

INSERT INTO public.platforms (workspace_id, slug, name, state)
SELECT DISTINCT so.workspace_id,
       lower(trim(so.platform)),
       initcap(trim(so.platform)),
       'active'::public.platform_state
FROM public.service_orders so
WHERE so.platform IS NOT NULL
  AND trim(so.platform) <> ''
  AND so.workspace_id IS NOT NULL
ON CONFLICT (workspace_id, slug) DO NOTHING;

ALTER TABLE public.platforms REPLICA IDENTITY FULL;
ALTER TABLE public.platform_state_log REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.platforms;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_state_log;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
