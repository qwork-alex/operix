
-- Add group_ids array column
ALTER TABLE public.profit_rules ADD COLUMN IF NOT EXISTS group_ids text[] DEFAULT '{}';

-- Migrate existing single group_id to array
UPDATE public.profit_rules
SET group_ids = ARRAY[group_id]
WHERE group_id IS NOT NULL AND (group_ids IS NULL OR group_ids = '{}');

-- Drop old column
ALTER TABLE public.profit_rules DROP COLUMN IF EXISTS group_id;
