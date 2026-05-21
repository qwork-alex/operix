
-- PHASE 6: Operational Workflow Engine (additive, isolated domain)

-- Status enum for production pipeline
DO $$ BEGIN
  CREATE TYPE public.production_status AS ENUM (
    'new_vehicle',
    'triage',
    'awaiting_validation',
    'in_production',
    'paused',
    'finished',
    'invoiced',
    'delivered'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.production_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.production_photo_category AS ENUM ('before','during','after','damage','validation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Core production orders (separate from service_orders to preserve admin flow)
CREATE TABLE IF NOT EXISTS public.production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  code text NOT NULL,
  client_id uuid,
  client_name text,
  technician_user_id uuid,
  technician_name text,
  platform text,
  insurer text,
  license_plate text,
  vin text,
  brand text,
  model text,
  color text,
  notes text,
  priority public.production_priority NOT NULL DEFAULT 'normal',
  status public.production_status NOT NULL DEFAULT 'new_vehicle',
  due_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  delivered_at timestamptz,
  service_order_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto code: PRD-YYYYMM-XXXX
CREATE SEQUENCE IF NOT EXISTS public.production_orders_seq;

CREATE OR REPLACE FUNCTION public.set_production_order_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := 'PRD-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('public.production_orders_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_production_orders_code ON public.production_orders;
CREATE TRIGGER trg_production_orders_code
  BEFORE INSERT ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_production_order_code();

DROP TRIGGER IF EXISTS trg_production_orders_updated ON public.production_orders;
CREATE TRIGGER trg_production_orders_updated
  BEFORE UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_prod_orders_ws ON public.production_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_prod_orders_tech ON public.production_orders(technician_user_id);
CREATE INDEX IF NOT EXISTS idx_prod_orders_status ON public.production_orders(status);
CREATE INDEX IF NOT EXISTS idx_prod_orders_created ON public.production_orders(created_at DESC);

-- Immutable timeline events
CREATE TABLE IF NOT EXISTS public.production_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  actor_user_id uuid NOT NULL DEFAULT auth.uid(),
  actor_name text,
  event_type text NOT NULL, -- created | status_changed | assigned | photo_added | note_added | priority_changed | field_updated
  from_value text,
  to_value text,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_events_order ON public.production_events(production_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prod_events_ws ON public.production_events(workspace_id);

-- Photos
CREATE TABLE IF NOT EXISTS public.production_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  category public.production_photo_category NOT NULL DEFAULT 'before',
  storage_path text NOT NULL,
  caption text,
  width int,
  height int,
  size_bytes int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_photos_order ON public.production_photos(production_order_id, created_at DESC);

-- Auto event triggers
CREATE OR REPLACE FUNCTION public.log_production_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor text;
BEGIN
  SELECT COALESCE(display_name, email, 'system')
    INTO v_actor
    FROM public.profiles
    WHERE user_id = auth.uid()
    LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.production_events(production_order_id, workspace_id, actor_user_id, actor_name, event_type, to_value, payload)
    VALUES (NEW.id, NEW.workspace_id, COALESCE(auth.uid(), NEW.created_by), v_actor, 'created', NEW.status::text,
      jsonb_build_object('code', NEW.code, 'priority', NEW.priority));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.production_events(production_order_id, workspace_id, actor_user_id, actor_name, event_type, from_value, to_value)
      VALUES (NEW.id, NEW.workspace_id, auth.uid(), v_actor, 'status_changed', OLD.status::text, NEW.status::text);
    END IF;
    IF NEW.technician_user_id IS DISTINCT FROM OLD.technician_user_id THEN
      INSERT INTO public.production_events(production_order_id, workspace_id, actor_user_id, actor_name, event_type, from_value, to_value)
      VALUES (NEW.id, NEW.workspace_id, auth.uid(), v_actor, 'assigned',
        COALESCE(OLD.technician_name, OLD.technician_user_id::text),
        COALESCE(NEW.technician_name, NEW.technician_user_id::text));
    END IF;
    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      INSERT INTO public.production_events(production_order_id, workspace_id, actor_user_id, actor_name, event_type, from_value, to_value)
      VALUES (NEW.id, NEW.workspace_id, auth.uid(), v_actor, 'priority_changed', OLD.priority::text, NEW.priority::text);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_prod_event_ins ON public.production_orders;
CREATE TRIGGER trg_prod_event_ins
  AFTER INSERT ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_production_event();

DROP TRIGGER IF EXISTS trg_prod_event_upd ON public.production_orders;
CREATE TRIGGER trg_prod_event_upd
  AFTER UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_production_event();

-- Photo upload event
CREATE OR REPLACE FUNCTION public.log_production_photo_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor text;
BEGIN
  SELECT COALESCE(display_name, email) INTO v_actor FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.production_events(production_order_id, workspace_id, actor_user_id, actor_name, event_type, to_value, payload)
  VALUES (NEW.production_order_id, NEW.workspace_id, auth.uid(), v_actor, 'photo_added', NEW.category::text,
    jsonb_build_object('storage_path', NEW.storage_path, 'caption', NEW.caption));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prod_photo_event ON public.production_photos;
CREATE TRIGGER trg_prod_photo_event
  AFTER INSERT ON public.production_photos
  FOR EACH ROW EXECUTE FUNCTION public.log_production_photo_event();

-- RLS
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_photos ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a member of workspace?
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE workspace_id = _workspace_id AND user_id = auth.uid() AND status = 'active'
  );
$$;

-- production_orders policies
DROP POLICY IF EXISTS "prod_orders_select" ON public.production_orders;
CREATE POLICY "prod_orders_select" ON public.production_orders FOR SELECT
USING (public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "prod_orders_insert" ON public.production_orders;
CREATE POLICY "prod_orders_insert" ON public.production_orders FOR INSERT
WITH CHECK (public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "prod_orders_update" ON public.production_orders;
CREATE POLICY "prod_orders_update" ON public.production_orders FOR UPDATE
USING (public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "prod_orders_delete" ON public.production_orders;
CREATE POLICY "prod_orders_delete" ON public.production_orders FOR DELETE
USING (public.has_role(auth.uid(),'admin'));

-- production_events: append-only
DROP POLICY IF EXISTS "prod_events_select" ON public.production_events;
CREATE POLICY "prod_events_select" ON public.production_events FOR SELECT
USING (public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "prod_events_insert" ON public.production_events;
CREATE POLICY "prod_events_insert" ON public.production_events FOR INSERT
WITH CHECK (public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(),'admin'));

-- production_photos
DROP POLICY IF EXISTS "prod_photos_select" ON public.production_photos;
CREATE POLICY "prod_photos_select" ON public.production_photos FOR SELECT
USING (public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "prod_photos_insert" ON public.production_photos;
CREATE POLICY "prod_photos_insert" ON public.production_photos FOR INSERT
WITH CHECK (public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "prod_photos_delete" ON public.production_photos;
CREATE POLICY "prod_photos_delete" ON public.production_photos FOR DELETE
USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- Storage bucket for production photos (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('production-photos', 'production-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "prod_photos_storage_read" ON storage.objects;
CREATE POLICY "prod_photos_storage_read" ON storage.objects FOR SELECT
USING (bucket_id = 'production-photos' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "prod_photos_storage_write" ON storage.objects;
CREATE POLICY "prod_photos_storage_write" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'production-photos' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "prod_photos_storage_delete" ON storage.objects;
CREATE POLICY "prod_photos_storage_delete" ON storage.objects FOR DELETE
USING (bucket_id = 'production-photos' AND auth.uid() IS NOT NULL);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.production_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.production_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.production_photos;

-- KPIs RPC
CREATE OR REPLACE FUNCTION public.production_kpis(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'in_progress', (SELECT count(*) FROM public.production_orders WHERE workspace_id=_workspace_id AND status IN ('in_production','triage','awaiting_validation')),
    'paused', (SELECT count(*) FROM public.production_orders WHERE workspace_id=_workspace_id AND status='paused'),
    'finished_today', (SELECT count(*) FROM public.production_orders WHERE workspace_id=_workspace_id AND finished_at >= date_trunc('day', now())),
    'delivered_today', (SELECT count(*) FROM public.production_orders WHERE workspace_id=_workspace_id AND delivered_at >= date_trunc('day', now())),
    'overdue', (SELECT count(*) FROM public.production_orders WHERE workspace_id=_workspace_id AND due_at < now() AND status NOT IN ('finished','invoiced','delivered')),
    'active_technicians', (SELECT count(DISTINCT technician_user_id) FROM public.production_orders WHERE workspace_id=_workspace_id AND status='in_production' AND technician_user_id IS NOT NULL),
    'avg_cycle_minutes', (SELECT COALESCE(EXTRACT(EPOCH FROM avg(finished_at - started_at))/60, 0)::int FROM public.production_orders WHERE workspace_id=_workspace_id AND finished_at IS NOT NULL AND started_at IS NOT NULL AND finished_at > now() - interval '30 days'),
    'by_platform', (SELECT COALESCE(jsonb_object_agg(platform, c),'{}'::jsonb) FROM (SELECT COALESCE(platform,'—') platform, count(*) c FROM public.production_orders WHERE workspace_id=_workspace_id AND created_at > now() - interval '30 days' GROUP BY platform) s)
  ) INTO v;
  RETURN v;
END $$;
