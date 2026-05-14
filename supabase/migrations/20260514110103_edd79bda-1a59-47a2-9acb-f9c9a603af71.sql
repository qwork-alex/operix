
-- 1) Storage bucket for receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('billing-receipts', 'billing-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "billing_receipts_select_own" ON storage.objects;
DROP POLICY IF EXISTS "billing_receipts_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "billing_receipts_delete_own" ON storage.objects;

CREATE POLICY "billing_receipts_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'billing-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "billing_receipts_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'billing-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "billing_receipts_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'billing-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 2) Recalculate invoice totals/status from payments
CREATE OR REPLACE FUNCTION public.billing_recalc_invoice(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_paid numeric;
  v_due date;
  v_current_status billing_invoice_status;
  v_new_status billing_invoice_status;
BEGIN
  SELECT total_amount, due_date, status
    INTO v_total, v_due, v_current_status
  FROM public.billing_invoices
  WHERE id = _invoice_id;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
  FROM public.billing_payments
  WHERE invoice_id = _invoice_id
    AND status = 'completed';

  IF v_paid >= COALESCE(v_total, 0) AND COALESCE(v_total, 0) > 0 THEN
    v_new_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_new_status := 'partial';
  ELSIF v_due IS NOT NULL AND v_due < CURRENT_DATE THEN
    v_new_status := 'overdue';
  ELSE
    -- preserve draft / cancelled
    v_new_status := CASE
      WHEN v_current_status IN ('draft','cancelled') THEN v_current_status
      ELSE 'pending'
    END;
  END IF;

  UPDATE public.billing_invoices
  SET paid_amount = v_paid,
      status = v_new_status,
      updated_at = now()
  WHERE id = _invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_payments_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.billing_recalc_invoice(OLD.invoice_id);
    RETURN OLD;
  END IF;

  PERFORM public.billing_recalc_invoice(NEW.invoice_id);
  IF TG_OP = 'UPDATE' AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
    PERFORM public.billing_recalc_invoice(OLD.invoice_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_payments_recalc ON public.billing_payments;
CREATE TRIGGER trg_billing_payments_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.billing_payments
FOR EACH ROW EXECUTE FUNCTION public.billing_payments_after_change();

-- 3) Seed default payment methods (idempotent by code)
INSERT INTO public.billing_payment_methods (name, code, is_active) VALUES
  ('Transferência bancária', 'bank_transfer', true),
  ('SEPA', 'sepa', true),
  ('Cartão', 'card', true),
  ('Dinheiro', 'cash', true),
  ('PIX', 'pix', true),
  ('Débito automático', 'direct_debit', true)
ON CONFLICT DO NOTHING;
