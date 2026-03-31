
ALTER TABLE public.financial_records ADD COLUMN IF NOT EXISTS label text DEFAULT NULL;
ALTER TABLE public.financial_records ADD COLUMN IF NOT EXISTS category text DEFAULT 'other';
