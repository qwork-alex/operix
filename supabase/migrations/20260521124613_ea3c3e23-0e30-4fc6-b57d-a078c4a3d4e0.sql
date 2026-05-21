
CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NULL REFERENCES public.workspaces(id) ON DELETE SET NULL,
  user_id uuid NULL,
  app_user_id uuid NULL,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','critical')),
  ip_address text NULL,
  user_agent text NULL,
  device text NULL,
  resource text NULL,
  resource_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sec_events_ws_time   ON public.security_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_user_time ON public.security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_type      ON public.security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_severity  ON public.security_events(severity, created_at DESC);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sec_events_select ON public.security_events;
CREATE POLICY sec_events_select ON public.security_events
FOR SELECT TO authenticated
USING (
  public.is_platform_owner(auth.uid())
  OR user_id = auth.uid()
  OR (workspace_id IS NOT NULL AND public.has_role_in_workspace(auth.uid(), 'admin', workspace_id))
);

DROP POLICY IF EXISTS sec_events_insert ON public.security_events;
CREATE POLICY sec_events_insert ON public.security_events
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS sec_events_no_update ON public.security_events;
CREATE POLICY sec_events_no_update ON public.security_events FOR UPDATE TO authenticated USING (false);
DROP POLICY IF EXISTS sec_events_delete ON public.security_events;
CREATE POLICY sec_events_delete ON public.security_events FOR DELETE TO authenticated USING (public.is_platform_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_security_event(
  _event_type text,
  _severity text DEFAULT 'info',
  _resource text DEFAULT NULL,
  _resource_id text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _workspace_id uuid DEFAULT NULL,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _risk_score integer DEFAULT 0
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app_uid uuid;
  v_id uuid;
BEGIN
  SELECT id INTO v_app_uid FROM public.app_users WHERE auth_user_id = v_uid LIMIT 1;
  INSERT INTO public.security_events (
    workspace_id, user_id, app_user_id, event_type, severity,
    ip_address, user_agent, resource, resource_id, metadata, risk_score
  ) VALUES (
    _workspace_id, v_uid, v_app_uid, _event_type,
    COALESCE(_severity,'info'), _ip, _user_agent, _resource, _resource_id,
    COALESCE(_metadata,'{}'::jsonb), COALESCE(_risk_score,0)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_security_event(text,text,text,text,jsonb,uuid,text,text,integer) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.assert_workspace_member(_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_platform_owner(auth.uid()) OR public.is_workspace_member(auth.uid(), _workspace_id);
$$;
GRANT EXECUTE ON FUNCTION public.assert_workspace_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.compute_security_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;
  SELECT jsonb_build_object(
    'logins_24h',      (SELECT count(*) FROM security_events WHERE event_type='login'        AND created_at > now() - interval '24 hours'),
    'failed_24h',      (SELECT count(*) FROM security_events WHERE event_type='login_failed' AND created_at > now() - interval '24 hours'),
    'critical_7d',     (SELECT count(*) FROM security_events WHERE severity='critical'       AND created_at > now() - interval '7 days'),
    'suspicious_7d',   (SELECT count(*) FROM security_events WHERE event_type='suspicious'   AND created_at > now() - interval '7 days'),
    'active_sessions', (SELECT count(DISTINCT user_id) FROM security_events WHERE event_type='login' AND created_at > now() - interval '24 hours'),
    'distinct_ips_24h',(SELECT count(DISTINCT ip_address) FROM security_events WHERE ip_address IS NOT NULL AND created_at > now() - interval '24 hours')
  ) INTO v;
  RETURN v;
END;
$$;
GRANT EXECUTE ON FUNCTION public.compute_security_metrics() TO authenticated;
