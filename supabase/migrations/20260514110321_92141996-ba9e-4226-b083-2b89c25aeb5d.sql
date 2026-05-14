
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
    AND status = 'confirmed';

  IF v_paid >= COALESCE(v_total, 0) AND COALESCE(v_total, 0) > 0 THEN
    v_new_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_new_status := 'partial';
  ELSIF v_due IS NOT NULL AND v_due < CURRENT_DATE THEN
    v_new_status := 'overdue';
  ELSE
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
