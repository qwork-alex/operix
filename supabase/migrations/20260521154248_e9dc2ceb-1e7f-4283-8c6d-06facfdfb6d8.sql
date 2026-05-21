-- 1. Extend manual_bank_transfers
ALTER TABLE public.manual_bank_transfers
  ADD COLUMN IF NOT EXISTS proof_path text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS transfer_date date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Allow new status values per spec
ALTER TABLE public.manual_bank_transfers
  DROP CONSTRAINT IF EXISTS manual_bank_transfers_status_check;
ALTER TABLE public.manual_bank_transfers
  ADD CONSTRAINT manual_bank_transfers_status_check
  CHECK (status IN ('awaiting_transfer','pending_manual_review','confirmed','rejected'));

ALTER TABLE public.manual_bank_transfers
  ALTER COLUMN status SET DEFAULT 'awaiting_transfer';

CREATE INDEX IF NOT EXISTS idx_mbt_workspace ON public.manual_bank_transfers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_mbt_invoice ON public.manual_bank_transfers(invoice_id);
CREATE INDEX IF NOT EXISTS idx_mbt_status ON public.manual_bank_transfers(status);

-- Touch trigger
DROP TRIGGER IF EXISTS trg_mbt_touch ON public.manual_bank_transfers;
CREATE TRIGGER trg_mbt_touch BEFORE UPDATE ON public.manual_bank_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. SELECT policy for workspace members (so users can see their own transfers)
DROP POLICY IF EXISTS "ws members read manual transfers" ON public.manual_bank_transfers;
CREATE POLICY "ws members read manual transfers"
  ON public.manual_bank_transfers FOR SELECT
  TO authenticated
  USING (
    is_platform_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM memberships m
      JOIN app_users au ON au.id = m.user_id
      WHERE m.workspace_id = manual_bank_transfers.workspace_id
        AND au.auth_user_id = auth.uid()
        AND m.status = 'active'
    )
  );

-- 3. Storage bucket for payment proofs
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "payment-proofs read members" ON storage.objects;
CREATE POLICY "payment-proofs read members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs' AND (
      is_platform_owner(auth.uid())
      OR EXISTS (
        SELECT 1 FROM memberships m
        JOIN app_users au ON au.id = m.user_id
        WHERE au.auth_user_id = auth.uid()
          AND m.status = 'active'
          AND m.workspace_id::text = (storage.foldername(name))[1]
      )
    )
  );

DROP POLICY IF EXISTS "payment-proofs insert admins" ON storage.objects;
CREATE POLICY "payment-proofs insert admins"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs' AND (
      is_platform_owner(auth.uid())
      OR EXISTS (
        SELECT 1 FROM memberships m
        JOIN app_users au ON au.id = m.user_id
        WHERE au.auth_user_id = auth.uid()
          AND m.status = 'active'
          AND m.role = 'admin'
          AND m.workspace_id::text = (storage.foldername(name))[1]
      )
    )
  );

-- 4. RPC: approve manual transfer (owner only)
CREATE OR REPLACE FUNCTION public.approve_manual_transfer(
  _transfer_id uuid,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t public.manual_bank_transfers%ROWTYPE;
  _payment_id uuid;
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _t FROM public.manual_bank_transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
  IF _t.status = 'confirmed' THEN RETURN _t.id; END IF;

  UPDATE public.manual_bank_transfers
     SET status = 'confirmed',
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         reviewer_notes = COALESCE(_notes, reviewer_notes)
   WHERE id = _transfer_id;

  -- Record formal payment
  INSERT INTO public.platform_subscription_payments
    (workspace_id, invoice_id, method, amount, currency, status, bank_account_id, external_ref, processed_at, metadata)
  VALUES
    (_t.workspace_id, _t.invoice_id,
     COALESCE(_t.payment_method, 'bank_transfer'),
     _t.amount, _t.currency, 'succeeded',
     _t.bank_account_id, _t.reference_code, now(),
     jsonb_build_object('manual_transfer_id', _t.id, 'source', 'manual_approval'))
  RETURNING id INTO _payment_id;

  -- Mark invoice paid
  IF _t.invoice_id IS NOT NULL THEN
    UPDATE public.platform_invoices
       SET status = 'paid',
           paid_at = now(),
           updated_at = now()
     WHERE id = _t.invoice_id AND status <> 'paid';

    INSERT INTO public.invoice_events (invoice_id, event_type, payload)
    VALUES (_t.invoice_id, 'manual_payment_approved',
            jsonb_build_object('transfer_id', _t.id, 'payment_id', _payment_id, 'amount', _t.amount));
  END IF;

  RETURN _payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_manual_transfer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_manual_transfer(uuid, text) TO authenticated;

-- 5. RPC: reject manual transfer (owner only)
CREATE OR REPLACE FUNCTION public.reject_manual_transfer(
  _transfer_id uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t public.manual_bank_transfers%ROWTYPE;
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _t FROM public.manual_bank_transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;

  UPDATE public.manual_bank_transfers
     SET status = 'rejected',
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         reviewer_notes = COALESCE(_reason, reviewer_notes)
   WHERE id = _transfer_id;

  IF _t.invoice_id IS NOT NULL THEN
    INSERT INTO public.invoice_events (invoice_id, event_type, payload)
    VALUES (_t.invoice_id, 'manual_payment_rejected',
            jsonb_build_object('transfer_id', _t.id, 'reason', _reason));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_manual_transfer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_manual_transfer(uuid, text) TO authenticated;

-- 6. RPC: submit manual transfer (workspace admin)
CREATE OR REPLACE FUNCTION public.submit_manual_transfer(
  _workspace_id uuid,
  _invoice_id uuid,
  _amount numeric,
  _currency text,
  _payment_method text,
  _bank_account_id uuid,
  _transfer_date date,
  _proof_path text,
  _notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _ref text;
  _is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    JOIN app_users au ON au.id = m.user_id
    WHERE m.workspace_id = _workspace_id
      AND au.auth_user_id = auth.uid()
      AND m.role = 'admin' AND m.status = 'active'
  ) INTO _is_admin;

  IF NOT (_is_admin OR public.is_platform_owner(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _ref := 'MBT-' || to_char(now(), 'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO public.manual_bank_transfers
    (workspace_id, invoice_id, reference_code, amount, currency,
     bank_account_id, status, payment_method, transfer_date,
     proof_path, notes, submitted_by, declared_at)
  VALUES
    (_workspace_id, _invoice_id, _ref, _amount, COALESCE(_currency, 'EUR'),
     _bank_account_id,
     CASE WHEN _proof_path IS NULL THEN 'awaiting_transfer' ELSE 'pending_manual_review' END,
     _payment_method, _transfer_date, _proof_path, _notes, auth.uid(), now())
  RETURNING id INTO _id;

  IF _invoice_id IS NOT NULL THEN
    INSERT INTO public.invoice_events (invoice_id, event_type, payload)
    VALUES (_invoice_id, 'manual_payment_submitted',
            jsonb_build_object('transfer_id', _id, 'amount', _amount, 'method', _payment_method));
  END IF;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_manual_transfer(uuid, uuid, numeric, text, text, uuid, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_manual_transfer(uuid, uuid, numeric, text, text, uuid, date, text, text) TO authenticated;