
-- Crowdsourced hail reports: community-driven validation layer
CREATE TABLE IF NOT EXISTS public.hail_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hail_event_id uuid REFERENCES public.hail_events(id) ON DELETE SET NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  city text,
  region text,
  country text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  hail_size_mm numeric,
  severity text NOT NULL DEFAULT 'low' CHECK (severity IN ('low','moderate','severe','extreme')),
  -- Lifecycle: forecast → partial → confirmed → community_validated
  status text NOT NULL DEFAULT 'partial' CHECK (status IN ('forecast','partial','confirmed','community_validated','rejected')),
  -- 0..1, computed from photo presence + corroboration count + reporter trust
  confidence_score numeric NOT NULL DEFAULT 0.3,
  corroboration_count integer NOT NULL DEFAULT 0,
  notes text,
  photo_storage_path text,
  photo_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hail_reports_geo ON public.hail_reports (lat, lng);
CREATE INDEX IF NOT EXISTS idx_hail_reports_observed ON public.hail_reports (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hail_reports_status ON public.hail_reports (status);
CREATE INDEX IF NOT EXISTS idx_hail_reports_event ON public.hail_reports (hail_event_id);

ALTER TABLE public.hail_reports ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read reports (community visibility)
CREATE POLICY "hail_reports_select_authenticated"
  ON public.hail_reports FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can submit a report
CREATE POLICY "hail_reports_insert_authenticated"
  ON public.hail_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Reporter can update own report; admins can update any
CREATE POLICY "hail_reports_update_self_or_admin"
  ON public.hail_reports FOR UPDATE
  TO authenticated
  USING (reporter_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (reporter_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));

-- Only admins can delete
CREATE POLICY "hail_reports_delete_admin"
  ON public.hail_reports FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER trg_hail_reports_updated_at
  BEFORE UPDATE ON public.hail_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public storage bucket for community photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('hail-reports', 'hail-reports', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "hail_reports_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'hail-reports');

CREATE POLICY "hail_reports_photos_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'hail-reports');

CREATE POLICY "hail_reports_photos_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'hail-reports' AND owner = auth.uid());

CREATE POLICY "hail_reports_photos_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'hail-reports' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role)));
