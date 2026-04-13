
-- Add group_id to profit_rules and make technician_id nullable
ALTER TABLE public.profit_rules ADD COLUMN IF NOT EXISTS group_id text;
ALTER TABLE public.profit_rules ALTER COLUMN technician_id DROP NOT NULL;

-- Drop the unique index on technician_id (active) since we now use group_id
DROP INDEX IF EXISTS idx_profit_rules_active_tech;

-- Create unique index on group_id for active rules
CREATE UNIQUE INDEX idx_profit_rules_active_group 
  ON public.profit_rules (group_id) WHERE is_active = true AND group_id IS NOT NULL;
