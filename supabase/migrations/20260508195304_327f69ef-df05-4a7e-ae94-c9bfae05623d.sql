REVOKE EXECUTE ON FUNCTION public.trg_apply_order_owner_so_po()       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_apply_owner_financial_records() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.trg_apply_order_owner_so_po()       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.trg_apply_owner_financial_records() TO authenticated;