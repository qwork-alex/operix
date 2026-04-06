
-- Add distance/duration per segment to trip points
ALTER TABLE public.fleet_trip_points 
  ADD COLUMN IF NOT EXISTS distance_from_previous numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_from_previous numeric DEFAULT 0;

-- Add total_duration to trips
ALTER TABLE public.fleet_trips 
  ADD COLUMN IF NOT EXISTS total_duration numeric DEFAULT NULL;

-- Make km_start optional (system relies on API calculations now)
ALTER TABLE public.fleet_trips ALTER COLUMN km_start DROP NOT NULL;
ALTER TABLE public.fleet_trips ALTER COLUMN km_start SET DEFAULT NULL;
