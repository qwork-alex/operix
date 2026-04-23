-- Step 1: Create technician record for owner
INSERT INTO technicians (id, name, email, user_id)
VALUES (
  gen_random_uuid(),
  'System Owner',
  'qwork@qworkgroup.com',
  '7ebc5b1d-b12c-44bb-af44-836c09e340ae'
)
ON CONFLICT DO NOTHING;

-- Step 2: Get the newly created technician ID and update service_orders
DO $$
DECLARE
  tech_id UUID;
BEGIN
  -- Find the technician we just created
  SELECT id INTO tech_id 
  FROM technicians 
  WHERE user_id = '7ebc5b1d-b12c-44bb-af44-836c09e340ae'
  LIMIT 1;
  
  -- If we found a technician, update NULL records
  IF tech_id IS NOT NULL THEN
    UPDATE service_orders
    SET technician_id = tech_id
    WHERE technician_id IS NULL;
  END IF;
END $$;

-- Step 3: Ensure technician_id is ALWAYS set
ALTER TABLE service_orders
ALTER COLUMN technician_id SET NOT NULL;

-- Step 4: Auto-fill for technicians (non-admin users)
CREATE OR REPLACE FUNCTION set_technician_on_insert()
RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_set_technician ON service_orders;

-- Create trigger
CREATE TRIGGER trg_set_technician
BEFORE INSERT ON service_orders
FOR EACH ROW
EXECUTE FUNCTION set_technician_on_insert();