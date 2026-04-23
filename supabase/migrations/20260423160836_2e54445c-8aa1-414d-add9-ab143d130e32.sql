-- Fix security warning: Set explicit search path for the trigger function
CREATE OR REPLACE FUNCTION set_technician_on_insert()
RETURNS trigger 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only auto-fill for non-admin users (technicians)
  IF NOT has_role(auth.uid(), 'admin') THEN
    NEW.technician_id := get_my_technician_id();
  END IF;
  
  -- Validate technician_id is set (admin must provide it)
  IF NEW.technician_id IS NULL THEN
    RAISE EXCEPTION 'technician_id is required. Admin users must select a technician.';
  END IF;
  
  RETURN NEW;
END;
$$;