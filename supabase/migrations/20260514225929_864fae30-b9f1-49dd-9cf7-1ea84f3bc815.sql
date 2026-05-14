
-- ============ weather_providers =====================================
CREATE TABLE IF NOT EXISTS public.weather_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 100,
  requires_api_key BOOLEAN NOT NULL DEFAULT false,
  api_key_secret_name TEXT,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  regions JSONB NOT NULL DEFAULT '["global"]'::jsonb,
  rate_limit_per_min INT NOT NULL DEFAULT 30,
  base_url TEXT,
  last_called_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  last_event_count INT,
  window_started_at TIMESTAMPTZ,
  request_count_window INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.weather_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weather_providers read auth" ON public.weather_providers;
CREATE POLICY "weather_providers read auth"
  ON public.weather_providers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "weather_providers admin write" ON public.weather_providers;
CREATE POLICY "weather_providers admin write"
  ON public.weather_providers FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS weather_providers_priority_idx
  ON public.weather_providers (enabled, priority);

-- ============ weather_cache =========================================
CREATE TABLE IF NOT EXISTS public.weather_cache (
  cache_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  capability TEXT NOT NULL,
  region_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weather_cache read auth" ON public.weather_cache;
CREATE POLICY "weather_cache read auth"
  ON public.weather_cache FOR SELECT
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS weather_cache_region_idx
  ON public.weather_cache (region_key, capability, expires_at);

-- ============ weather_sync_runs =====================================
CREATE TABLE IF NOT EXISTS public.weather_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  region_key TEXT,
  capability TEXT,
  ok BOOLEAN NOT NULL,
  events_upserted INT NOT NULL DEFAULT 0,
  duration_ms INT,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.weather_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weather_sync_runs read auth" ON public.weather_sync_runs;
CREATE POLICY "weather_sync_runs read auth"
  ON public.weather_sync_runs FOR SELECT
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS weather_sync_runs_recent_idx
  ON public.weather_sync_runs (created_at DESC);

-- updated_at trigger for providers
DROP TRIGGER IF EXISTS weather_providers_set_updated_at ON public.weather_providers;
CREATE TRIGGER weather_providers_set_updated_at
  BEFORE UPDATE ON public.weather_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Seed registry ==========================================
INSERT INTO public.weather_providers
  (key, name, enabled, priority, requires_api_key, api_key_secret_name, capabilities, regions, rate_limit_per_min, base_url)
VALUES
  ('rainviewer',         'RainViewer',         true,  10, false, NULL,                 '["radar","precipitation"]'::jsonb,                                  '["global"]'::jsonb,                       60,  'https://api.rainviewer.com'),
  ('meteofrance',        'Météo-France',       true,  20, false, NULL,                 '["alerts","hail","severe"]'::jsonb,                                 '["FR"]'::jsonb,                            30,  'https://public-api.meteofrance.fr'),
  ('noaa',               'NOAA / NWS',         true,  20, false, NULL,                 '["alerts","hail","severe","storm_cells"]'::jsonb,                  '["US"]'::jsonb,                            60,  'https://api.weather.gov'),
  ('environment_canada', 'Environment Canada', true,  20, false, NULL,                 '["alerts","severe"]'::jsonb,                                       '["CA"]'::jsonb,                            30,  'https://weather.gc.ca'),
  ('openweather',        'OpenWeather',        false, 30, true,  'OPENWEATHER_API_KEY','["precipitation","wind","alerts"]'::jsonb,                         '["global"]'::jsonb,                        60,  'https://api.openweathermap.org'),
  ('tomorrowio',         'Tomorrow.io',        false, 30, true,  'TOMORROWIO_API_KEY', '["hail","precipitation","wind","lightning","storm_cells"]'::jsonb,'["global"]'::jsonb,                        25,  'https://api.tomorrow.io'),
  ('weatherapi',         'WeatherAPI',         false, 30, true,  'WEATHERAPI_API_KEY', '["alerts","precipitation","wind"]'::jsonb,                         '["global"]'::jsonb,                        60,  'https://api.weatherapi.com')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  capabilities = EXCLUDED.capabilities,
  regions = EXCLUDED.regions,
  base_url = EXCLUDED.base_url,
  api_key_secret_name = EXCLUDED.api_key_secret_name,
  requires_api_key = EXCLUDED.requires_api_key;
