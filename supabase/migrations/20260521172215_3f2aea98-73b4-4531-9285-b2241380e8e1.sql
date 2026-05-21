-- Fix set_year_reference() trigger: avoid static NEW.issue_date reference
-- which fails on tables (service_orders, payment_orders, financial_records)
-- that don't have an issue_date column.
CREATE OR REPLACE FUNCTION public.set_year_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_row jsonb;
  v_issue text;
BEGIN
  IF NEW.year_reference IS NULL THEN
    v_row := to_jsonb(NEW);
    v_issue := v_row->>'issue_date';
    NEW.year_reference := extract(year from COALESCE(
      CASE WHEN v_issue IS NOT NULL AND v_issue <> '' THEN v_issue::timestamptz ELSE NULL END,
      NEW.created_at,
      now()
    ))::int;
  END IF;
  RETURN NEW;
END $$;