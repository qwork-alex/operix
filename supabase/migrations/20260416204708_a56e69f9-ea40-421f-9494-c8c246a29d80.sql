
ALTER TABLE public.payment_orders
ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;

-- Backfill: recompute status for all existing rows based on amount_paid vs total
UPDATE public.payment_orders
SET status = CASE
  WHEN COALESCE(amount_paid, 0) <= 0 THEN 'pending'
  WHEN COALESCE(total, 0) > 0 AND amount_paid >= total THEN 'paid'
  ELSE 'partial'
END
WHERE TRUE;
