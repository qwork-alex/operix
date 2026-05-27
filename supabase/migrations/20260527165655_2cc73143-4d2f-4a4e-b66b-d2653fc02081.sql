
INSERT INTO public.weather_providers
  (key, name, enabled, priority, requires_api_key, api_key_secret_name,
   capabilities, regions, rate_limit_per_min)
VALUES
  ('convective_inference',
   'Convective Inference Engine (OpenMeteo CAPE/LI)',
   true, 15, false, null,
   '["hail","severe","storm_cells","precipitation","wind"]'::jsonb,
   '["global"]'::jsonb,
   60)
ON CONFLICT (key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  priority = EXCLUDED.priority,
  capabilities = EXCLUDED.capabilities,
  regions = EXCLUDED.regions,
  rate_limit_per_min = EXCLUDED.rate_limit_per_min,
  name = EXCLUDED.name;

DELETE FROM public.weather_cache WHERE provider IN ('openmeteo','tomorrowio','convective_inference');
