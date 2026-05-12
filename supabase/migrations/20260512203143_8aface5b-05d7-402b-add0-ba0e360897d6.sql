ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS display_name text,
ADD COLUMN IF NOT EXISTS rotation integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS zoom numeric NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS validated boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS visual_state jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

UPDATE public.documents
SET display_name = name
WHERE display_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_visual_state ON public.documents USING gin (visual_state);

CREATE OR REPLACE FUNCTION public.touch_documents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.display_name IS NULL OR btrim(NEW.display_name) = '' THEN
    NEW.display_name = NEW.name;
  END IF;
  IF NEW.rotation IS NULL THEN
    NEW.rotation = 0;
  END IF;
  NEW.rotation = ((NEW.rotation % 360) + 360) % 360;
  IF NEW.zoom IS NULL OR NEW.zoom <= 0 THEN
    NEW.zoom = 1;
  END IF;
  IF NEW.visual_state IS NULL THEN
    NEW.visual_state = '{}'::jsonb;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_documents_updated_at ON public.documents;
CREATE TRIGGER trg_touch_documents_updated_at
BEFORE INSERT OR UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.touch_documents_updated_at();