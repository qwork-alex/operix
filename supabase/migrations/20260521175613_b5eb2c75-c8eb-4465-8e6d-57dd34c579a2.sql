
-- =========================
-- ENUMS
-- =========================
DO $$ BEGIN
  CREATE TYPE public.marketplace_category AS ENUM ('vehicles','parts','services','tools','equipment','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.marketplace_condition AS ENUM ('new','like_new','good','fair','for_parts');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.marketplace_visibility AS ENUM ('public','private','workspace','clients','team');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.marketplace_status AS ENUM ('draft','active','sold','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================
-- LISTINGS
-- =========================
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  created_by uuid NOT NULL,
  title text NOT NULL,
  description text,
  price numeric(14,2),
  currency text NOT NULL DEFAULT 'EUR',
  category public.marketplace_category NOT NULL DEFAULT 'other',
  condition public.marketplace_condition,
  location text,
  manufacturer text,
  model text,
  year int,
  visibility public.marketplace_visibility NOT NULL DEFAULT 'workspace',
  status public.marketplace_status NOT NULL DEFAULT 'draft',
  cover_photo_path text,
  view_count int NOT NULL DEFAULT 0,
  favorite_count int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_workspace ON public.marketplace_listings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_creator ON public.marketplace_listings(created_by);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON public.marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_category ON public.marketplace_listings(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_visibility ON public.marketplace_listings(visibility);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_created_at ON public.marketplace_listings(created_at DESC);

ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

-- =========================
-- PHOTOS
-- =========================
CREATE TABLE IF NOT EXISTS public.marketplace_listing_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  order_index int NOT NULL DEFAULT 0,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketplace_photos_listing ON public.marketplace_listing_photos(listing_id);
ALTER TABLE public.marketplace_listing_photos ENABLE ROW LEVEL SECURITY;

-- =========================
-- VIEWS / FAVORITES
-- =========================
CREATE TABLE IF NOT EXISTS public.marketplace_listing_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  viewer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id, viewer_id)
);
ALTER TABLE public.marketplace_listing_views ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.marketplace_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id, user_id)
);
ALTER TABLE public.marketplace_favorites ENABLE ROW LEVEL SECURITY;

-- =========================
-- updated_at + workspace_id triggers
-- =========================
DROP TRIGGER IF EXISTS trg_marketplace_listings_updated_at ON public.marketplace_listings;
CREATE TRIGGER trg_marketplace_listings_updated_at
BEFORE UPDATE ON public.marketplace_listings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- reuse existing set_workspace_id_from_creator if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_workspace_id_from_creator') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_marketplace_listings_set_ws ON public.marketplace_listings';
    EXECUTE 'CREATE TRIGGER trg_marketplace_listings_set_ws BEFORE INSERT ON public.marketplace_listings FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_creator()';
  END IF;
END $$;

-- =========================
-- RLS POLICIES
-- =========================

-- Helper: resolve current app_user id
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.app_users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- LISTINGS: SELECT
DROP POLICY IF EXISTS "marketplace_listings_select" ON public.marketplace_listings;
CREATE POLICY "marketplace_listings_select"
ON public.marketplace_listings FOR SELECT
USING (
  -- creator always sees own
  created_by = auth.uid()
  OR created_by = public.current_app_user_id()
  -- platform owner / admin
  OR public.has_role(auth.uid(), 'admin'::app_role)
  -- active + public to everyone authenticated
  OR (status = 'active' AND visibility = 'public' AND auth.uid() IS NOT NULL)
  -- active + workspace-scoped to members of that workspace
  OR (
    status = 'active'
    AND visibility IN ('workspace','team','clients')
    AND workspace_id IS NOT NULL
    AND public.user_can_access_workspace(auth.uid(), workspace_id)
  )
);

-- LISTINGS: INSERT
DROP POLICY IF EXISTS "marketplace_listings_insert" ON public.marketplace_listings;
CREATE POLICY "marketplace_listings_insert"
ON public.marketplace_listings FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (created_by = auth.uid() OR created_by = public.current_app_user_id())
);

-- LISTINGS: UPDATE
DROP POLICY IF EXISTS "marketplace_listings_update" ON public.marketplace_listings;
CREATE POLICY "marketplace_listings_update"
ON public.marketplace_listings FOR UPDATE
USING (
  created_by = auth.uid()
  OR created_by = public.current_app_user_id()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- LISTINGS: DELETE
DROP POLICY IF EXISTS "marketplace_listings_delete" ON public.marketplace_listings;
CREATE POLICY "marketplace_listings_delete"
ON public.marketplace_listings FOR DELETE
USING (
  created_by = auth.uid()
  OR created_by = public.current_app_user_id()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- PHOTOS: inherit access from listing
DROP POLICY IF EXISTS "marketplace_photos_select" ON public.marketplace_listing_photos;
CREATE POLICY "marketplace_photos_select"
ON public.marketplace_listing_photos FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id = listing_id)
);

DROP POLICY IF EXISTS "marketplace_photos_insert" ON public.marketplace_listing_photos;
CREATE POLICY "marketplace_photos_insert"
ON public.marketplace_listing_photos FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.marketplace_listings l
    WHERE l.id = listing_id
      AND (l.created_by = auth.uid() OR l.created_by = public.current_app_user_id() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS "marketplace_photos_delete" ON public.marketplace_listing_photos;
CREATE POLICY "marketplace_photos_delete"
ON public.marketplace_listing_photos FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.marketplace_listings l
    WHERE l.id = listing_id
      AND (l.created_by = auth.uid() OR l.created_by = public.current_app_user_id() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

-- VIEWS
DROP POLICY IF EXISTS "marketplace_views_insert" ON public.marketplace_listing_views;
CREATE POLICY "marketplace_views_insert"
ON public.marketplace_listing_views FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "marketplace_views_select" ON public.marketplace_listing_views;
CREATE POLICY "marketplace_views_select"
ON public.marketplace_listing_views FOR SELECT
USING (
  viewer_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.marketplace_listings l
    WHERE l.id = listing_id
      AND (l.created_by = auth.uid() OR l.created_by = public.current_app_user_id())
  )
);

-- FAVORITES
DROP POLICY IF EXISTS "marketplace_favorites_all" ON public.marketplace_favorites;
CREATE POLICY "marketplace_favorites_all"
ON public.marketplace_favorites FOR ALL
USING (user_id = auth.uid() OR user_id = public.current_app_user_id())
WITH CHECK (user_id = auth.uid() OR user_id = public.current_app_user_id());

-- =========================
-- STORAGE BUCKET
-- =========================
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketplace', 'marketplace', true)
ON CONFLICT (id) DO NOTHING;

-- Public read (bucket is public). Restrict writes to authenticated users in their own user folder.
DROP POLICY IF EXISTS "marketplace_storage_read" ON storage.objects;
CREATE POLICY "marketplace_storage_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'marketplace');

DROP POLICY IF EXISTS "marketplace_storage_insert" ON storage.objects;
CREATE POLICY "marketplace_storage_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'marketplace'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "marketplace_storage_update" ON storage.objects;
CREATE POLICY "marketplace_storage_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'marketplace'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "marketplace_storage_delete" ON storage.objects;
CREATE POLICY "marketplace_storage_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'marketplace'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);
