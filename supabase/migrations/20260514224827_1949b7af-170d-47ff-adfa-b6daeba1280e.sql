
-- Hail events schema (operational weather intelligence)
CREATE TABLE IF NOT EXISTS public.hail_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'manual',           -- manual | meteofrance | essl | tomorrowio | weatherbit
  external_id TEXT,                                 -- provider's stable id for dedupe
  city TEXT,
  region TEXT,
  country TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_km NUMERIC NOT NULL DEFAULT 15,
  severity TEXT NOT NULL DEFAULT 'low',            -- low | moderate | severe | extreme
  status TEXT NOT NULL DEFAULT 'forecast',          -- forecast | ongoing | confirmed | closed
  hail_size_mm NUMERIC,                             -- estimated diameter
  probability NUMERIC,                              -- 0..1
  intensity NUMERIC,                                -- arbitrary scale 0..100
  storm_speed_kmh NUMERIC,
  storm_direction_deg NUMERIC,
  forecast_time TIMESTAMPTZ,
  observed_time TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hail_events_severity_check CHECK (severity IN ('low','moderate','severe','extreme')),
  CONSTRAINT hail_events_status_check CHECK (status IN ('forecast','ongoing','confirmed','closed')),
  CONSTRAINT hail_events_source_external_unique UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS hail_events_status_idx ON public.hail_events (status);
CREATE INDEX IF NOT EXISTS hail_events_severity_idx ON public.hail_events (severity);
CREATE INDEX IF NOT EXISTS hail_events_geo_idx ON public.hail_events (lat, lng);
CREATE INDEX IF NOT EXISTS hail_events_forecast_time_idx ON public.hail_events (forecast_time DESC);

ALTER TABLE public.hail_events ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user
CREATE POLICY "hail_events read for authenticated"
  ON public.hail_events FOR SELECT
  TO authenticated
  USING (true);

-- Write: admins only
CREATE POLICY "hail_events insert admin"
  ON public.hail_events FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "hail_events update admin"
  ON public.hail_events FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "hail_events delete admin"
  ON public.hail_events FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Touch updated_at
CREATE TRIGGER trg_hail_events_touch_updated_at
  BEFORE UPDATE ON public.hail_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.hail_events;
ALTER TABLE public.hail_events REPLICA IDENTITY FULL;
