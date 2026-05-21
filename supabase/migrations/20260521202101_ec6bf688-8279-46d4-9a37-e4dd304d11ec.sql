
-- ============================================================
-- AUTOMATION ENGINE — schema, RLS, enqueue function, triggers
-- ============================================================

-- 1. Rules
CREATE TABLE public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  delay_seconds INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  retry_backoff_seconds INTEGER NOT NULL DEFAULT 30,
  enabled BOOLEAN NOT NULL DEFAULT true,
  safe_mode BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX automation_rules_ws_idx ON public.automation_rules(workspace_id, enabled);
CREATE INDEX automation_rules_trigger_idx ON public.automation_rules(trigger_type, enabled);
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

-- 2. Queue
CREATE TABLE public.automation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  rule_id UUID REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_correlation_id TEXT,
  depth INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','failed','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX automation_queue_pending_idx
  ON public.automation_queue(status, scheduled_at)
  WHERE status IN ('pending','failed');
CREATE INDEX automation_queue_ws_idx ON public.automation_queue(workspace_id, created_at DESC);
ALTER TABLE public.automation_queue ENABLE ROW LEVEL SECURITY;

-- 3. Executions
CREATE TABLE public.automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  rule_id UUID,
  queue_id UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL
    CHECK (status IN ('success','failed','skipped','dry_run')),
  attempt INTEGER NOT NULL DEFAULT 1,
  actions_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX automation_exec_ws_idx ON public.automation_executions(workspace_id, created_at DESC);
CREATE INDEX automation_exec_rule_idx ON public.automation_executions(rule_id, created_at DESC);
CREATE INDEX automation_exec_status_idx ON public.automation_executions(status, created_at DESC);
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

-- 4. Dead letter
CREATE TABLE public.automation_dead_letter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  queue_id UUID,
  rule_id UUID,
  last_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX automation_dl_ws_idx ON public.automation_dead_letter(workspace_id, created_at DESC);
ALTER TABLE public.automation_dead_letter ENABLE ROW LEVEL SECURITY;

-- updated_at triggers (reuse existing helper if present, else inline)
CREATE OR REPLACE FUNCTION public.touch_automation_rule()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER automation_rules_touch BEFORE UPDATE ON public.automation_rules
FOR EACH ROW EXECUTE FUNCTION public.touch_automation_rule();

CREATE OR REPLACE FUNCTION public.touch_automation_queue()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER automation_queue_touch BEFORE UPDATE ON public.automation_queue
FOR EACH ROW EXECUTE FUNCTION public.touch_automation_queue();

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- automation_rules — members read; admin/socio manage
CREATE POLICY "automation_rules_select"
  ON public.automation_rules FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "automation_rules_insert"
  ON public.automation_rules FOR INSERT TO authenticated
  WITH CHECK (
    public.is_workspace_member(auth.uid(), workspace_id)
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'partner'::app_role))
  );

CREATE POLICY "automation_rules_update"
  ON public.automation_rules FOR UPDATE TO authenticated
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'partner'::app_role))
  );

CREATE POLICY "automation_rules_delete"
  ON public.automation_rules FOR DELETE TO authenticated
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'partner'::app_role))
  );

-- queue/exec/dead — members read, no direct writes
CREATE POLICY "automation_queue_select"
  ON public.automation_queue FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "automation_queue_no_write_ins"
  ON public.automation_queue FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "automation_queue_no_write_upd"
  ON public.automation_queue FOR UPDATE TO authenticated USING (false);
CREATE POLICY "automation_queue_no_write_del"
  ON public.automation_queue FOR DELETE TO authenticated USING (false);

CREATE POLICY "automation_exec_select"
  ON public.automation_executions FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "automation_exec_no_write_ins"
  ON public.automation_executions FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "automation_exec_no_write_upd"
  ON public.automation_executions FOR UPDATE TO authenticated USING (false);
CREATE POLICY "automation_exec_no_write_del"
  ON public.automation_executions FOR DELETE TO authenticated USING (false);

CREATE POLICY "automation_dl_select"
  ON public.automation_dead_letter FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "automation_dl_no_write_ins"
  ON public.automation_dead_letter FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "automation_dl_no_write_upd"
  ON public.automation_dead_letter FOR UPDATE TO authenticated USING (false);
CREATE POLICY "automation_dl_no_write_del"
  ON public.automation_dead_letter FOR DELETE TO authenticated USING (false);

-- ============================================================
-- ENQUEUE FUNCTION — anti-recursion + bounded depth
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_automation_event(
  _workspace_id UUID,
  _event_type   TEXT,
  _entity_type  TEXT,
  _entity_id    UUID,
  _payload      JSONB,
  _correlation  TEXT DEFAULT NULL,
  _depth        INTEGER DEFAULT 0,
  _delay_seconds INTEGER DEFAULT 0
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  -- anti-recursion guards
  IF _workspace_id IS NULL THEN RETURN NULL; END IF;
  IF _correlation IS NOT NULL AND _correlation LIKE 'engine:%' THEN RETURN NULL; END IF;
  IF _depth > 3 THEN RETURN NULL; END IF;

  -- short-circuit: skip enqueue if no enabled rule matches this trigger in this workspace
  IF NOT EXISTS (
    SELECT 1 FROM public.automation_rules
    WHERE workspace_id = _workspace_id
      AND trigger_type = _event_type
      AND enabled = true
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.automation_queue (
    workspace_id, event_type, entity_type, entity_id, payload,
    source_correlation_id, depth, scheduled_at
  ) VALUES (
    _workspace_id, _event_type, _entity_type, _entity_id, COALESCE(_payload,'{}'::jsonb),
    _correlation, _depth, now() + make_interval(secs => GREATEST(_delay_seconds, 0))
  ) RETURNING id INTO new_id;

  RETURN new_id;
END $$;

-- ============================================================
-- LIGHTWEIGHT TRIGGERS — only enqueue, never act
-- ============================================================

-- service_orders
CREATE OR REPLACE FUNCTION public.tg_automation_service_orders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE evt TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN evt := 'service_order.created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN evt := 'service_order.status_changed';
    ELSE evt := 'service_order.updated';
    END IF;
  ELSE RETURN NULL;
  END IF;
  PERFORM public.enqueue_automation_event(
    NEW.workspace_id, evt, 'service_order', NEW.id,
    jsonb_build_object('new', to_jsonb(NEW), 'old', CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END),
    NULL, 0, 0
  );
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS automation_service_orders_aiu ON public.service_orders;
CREATE TRIGGER automation_service_orders_aiu
AFTER INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_automation_service_orders();

-- payment_orders
CREATE OR REPLACE FUNCTION public.tg_automation_payment_orders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE evt TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN evt := 'payment_order.created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN evt := 'payment_order.status_changed';
    ELSE evt := 'payment_order.updated';
    END IF;
  ELSE RETURN NULL;
  END IF;
  PERFORM public.enqueue_automation_event(
    NEW.workspace_id, evt, 'payment_order', NEW.id,
    jsonb_build_object('new', to_jsonb(NEW), 'old', CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END),
    NULL, 0, 0
  );
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS automation_payment_orders_aiu ON public.payment_orders;
CREATE TRIGGER automation_payment_orders_aiu
AFTER INSERT OR UPDATE ON public.payment_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_automation_payment_orders();

-- fleet_fuel_logs
CREATE OR REPLACE FUNCTION public.tg_automation_fuel_logs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RETURN NULL; END IF;
  PERFORM public.enqueue_automation_event(
    NEW.workspace_id, 'fleet.fuel_logged', 'fleet_fuel_log', NEW.id,
    to_jsonb(NEW), NULL, 0, 0
  );
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS automation_fuel_logs_ai ON public.fleet_fuel_logs;
CREATE TRIGGER automation_fuel_logs_ai
AFTER INSERT ON public.fleet_fuel_logs
FOR EACH ROW EXECUTE FUNCTION public.tg_automation_fuel_logs();

-- ============================================================
-- KPI helper view (workspace-scoped via RLS on base tables)
-- ============================================================
CREATE OR REPLACE VIEW public.v_automation_engine_stats AS
SELECT
  workspace_id,
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') AS executions_24h,
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours' AND status='success') AS success_24h,
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours' AND status='failed') AS failed_24h,
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours' AND status='dry_run') AS dry_run_24h
FROM public.automation_executions
GROUP BY workspace_id;
