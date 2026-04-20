ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS entity_type text;
CREATE INDEX IF NOT EXISTS idx_doc_entity ON public.documents(entity_type, entity_id);