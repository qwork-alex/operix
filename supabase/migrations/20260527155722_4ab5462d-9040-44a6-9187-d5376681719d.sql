
-- ============================================================
-- Hail Radar — operational lifecycle (Forecast / Live / Confirmed / Expired)
-- ============================================================

-- 1) Default TTL on insert: ensure every event has an expires_at
CREATE OR REPLACE FUNCTION public.hail_events_set_default_ttl()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Normalize timestamps to UTC (timestamptz already stores UTC, this just guards null)
  IF NEW.expires_at IS NULL THEN
    -- Forecast: TTL based on forecast horizon (default 6h)
    -- Live/Confirmed: shorter heartbeat window (default 90 min)
    IF NEW.status = 'forecast' THEN
      NEW.expires_at := COALESCE(NEW.forecast_time, NEW.observed_time, now()) + interval '6 hours';
    ELSE
      NEW.expires_at := COALESCE(NEW.observed_time, NEW.forecast_time, now()) + interval '90 minutes';
    END IF;
  END IF;

  -- A freshly-arrived live/confirmed event for the same (source, external_id)
  -- naturally upserts via existing unique constraint and resets expires_at.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hail_events_default_ttl ON public.hail_events;
CREATE TRIGGER trg_hail_events_default_ttl
BEFORE INSERT ON public.hail_events
FOR EACH ROW EXECUTE FUNCTION public.hail_events_set_default_ttl();

-- 2) Stale cleanup — runs every 5 minutes via pg_cron
CREATE OR REPLACE FUNCTION public.cleanup_stale_hail_events()
RETURNS TABLE(closed_count integer, forecast_expired integer, live_expired integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_forecast int := 0;
  v_live int := 0;
BEGIN
  -- A) Forecast events whose horizon has passed without confirmation
  WITH upd AS (
    UPDATE public.hail_events
       SET status = 'closed', updated_at = now()
     WHERE status = 'forecast'
       AND (
         expires_at < now()
         OR (forecast_time IS NOT NULL AND forecast_time < now() - interval '15 minutes')
       )
    RETURNING 1
  )
  SELECT count(*) INTO v_forecast FROM upd;

  -- B) Live / confirmed events with no heartbeat → expire
  WITH upd AS (
    UPDATE public.hail_events
       SET status = 'closed', updated_at = now()
     WHERE status IN ('ongoing', 'confirmed')
       AND (
         (expires_at IS NOT NULL AND expires_at < now())
         OR (
           expires_at IS NULL
           AND COALESCE(observed_time, forecast_time, created_at) < now() - interval '3 hours'
         )
       )
    RETURNING 1
  )
  SELECT count(*) INTO v_live FROM upd;

  closed_count := v_forecast + v_live;
  forecast_expired := v_forecast;
  live_expired := v_live;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_hail_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_hail_events() TO service_role;

-- 3) Cron — every 5 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hail-events-stale-cleanup') THEN
    PERFORM cron.unschedule('hail-events-stale-cleanup');
  END IF;
  PERFORM cron.schedule(
    'hail-events-stale-cleanup',
    '*/5 * * * *',
    $cron$ SELECT public.cleanup_stale_hail_events(); $cron$
  );
END $$;

-- 4) One-shot retro-clean of existing rows so the radar reflects reality immediately
SELECT public.cleanup_stale_hail_events();

-- 5) Index to speed up the "active radar" query (status + recency)
CREATE INDEX IF NOT EXISTS idx_hail_events_status_expires
  ON public.hail_events (status, expires_at DESC);
