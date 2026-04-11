ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS brand_config jsonb DEFAULT '{}'::jsonb;