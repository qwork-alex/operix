-- Create storage bucket for company logos
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to logos bucket
CREATE POLICY "Authenticated users can upload logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'logos');

-- Allow public read access to logos
CREATE POLICY "Public can read logos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'logos');

-- Allow authenticated users to update/delete logos
CREATE POLICY "Authenticated users can update logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'logos');

CREATE POLICY "Authenticated users can delete logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'logos');