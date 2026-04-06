-- Step 1: Add a temp column to preserve existing data
ALTER TABLE public.fleet_trips ADD COLUMN total_distance_temp numeric;

-- Step 2: Copy existing computed values
UPDATE public.fleet_trips SET total_distance_temp = total_distance;

-- Step 3: Drop the generated column
ALTER TABLE public.fleet_trips DROP COLUMN total_distance;

-- Step 4: Rename temp to total_distance
ALTER TABLE public.fleet_trips RENAME COLUMN total_distance_temp TO total_distance;