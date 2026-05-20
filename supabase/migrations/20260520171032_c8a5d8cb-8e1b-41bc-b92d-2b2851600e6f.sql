
-- Phase 3: Accounting receipts storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('accounting-receipts', 'accounting-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies: per-user folder
DROP POLICY IF EXISTS "accounting_receipts_select" ON storage.objects;
CREATE POLICY "accounting_receipts_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'accounting-receipts'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS "accounting_receipts_insert" ON storage.objects;
CREATE POLICY "accounting_receipts_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'accounting-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "accounting_receipts_delete" ON storage.objects;
CREATE POLICY "accounting_receipts_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'accounting-receipts'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);
