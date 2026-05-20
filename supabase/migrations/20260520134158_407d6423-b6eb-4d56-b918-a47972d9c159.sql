-- Accounting isolation: enforce workspace_id, user_id, year_reference per record

-- 1. Backfill year_reference
UPDATE public.financial_records
SET year_reference = EXTRACT(YEAR FROM created_at)::int
WHERE year_reference IS NULL AND created_at IS NOT NULL;

-- 2. Trigger: auto-fill year_reference
CREATE OR REPLACE FUNCTION public.set_financial_records_year_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.year_reference IS NULL THEN
    NEW.year_reference := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::int;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_financial_records_year_reference ON public.financial_records;
CREATE TRIGGER trg_set_financial_records_year_reference
BEFORE INSERT OR UPDATE ON public.financial_records
FOR EACH ROW
EXECUTE FUNCTION public.set_financial_records_year_reference();

-- 3. Trigger: auto-fill workspace_id from caller's app_users record
CREATE OR REPLACE FUNCTION public.set_financial_records_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ws uuid;
BEGIN
  IF NEW.workspace_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT workspace_id INTO v_ws
    FROM public.app_users
    WHERE auth_user_id = auth.uid()
    LIMIT 1;

    IF v_ws IS NOT NULL THEN
      NEW.workspace_id := v_ws;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_financial_records_workspace ON public.financial_records;
CREATE TRIGGER trg_set_financial_records_workspace
BEFORE INSERT ON public.financial_records
FOR EACH ROW
EXECUTE FUNCTION public.set_financial_records_workspace();

-- 4. Accounting isolation SELECT policy: manual expense rows are private per user
DROP POLICY IF EXISTS financial_records_accounting_isolation ON public.financial_records;
CREATE POLICY financial_records_accounting_isolation
ON public.financial_records
FOR SELECT
USING (
  -- Allow non-manual rows through (other policies still apply)
  NOT (
    source IN ('manual', 'manual_financial')
    AND category IN ('rent', 'fuel', 'material', 'tax', 'salary', 'other')
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'partner'::app_role)
  OR user_id = auth.uid()
  OR assigned_user_id = auth.uid()
  OR created_by = auth.uid()
);

-- 5. Index for the new filtered reads
CREATE INDEX IF NOT EXISTS idx_financial_records_ws_user_cat_year
ON public.financial_records (workspace_id, user_id, category, year_reference);

-- 6. Accounting audit logger
CREATE OR REPLACE FUNCTION public.log_accounting_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.financial_records;
BEGIN
  v_row := COALESCE(NEW, OLD);
  IF v_row.source NOT IN ('manual', 'manual_financial') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.backend_event_logs (table_name, action, row_id, actor_user_id, payload)
  VALUES (
    'financial_records',
    'ACCOUNTING_' || TG_OP,
    v_row.id,
    auth.uid(),
    jsonb_build_object(
      'workspace_id', v_row.workspace_id,
      'user_id', v_row.user_id,
      'year_reference', v_row.year_reference,
      'category', v_row.category,
      'amount', v_row.amount
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_accounting_event ON public.financial_records;
CREATE TRIGGER trg_log_accounting_event
AFTER INSERT OR UPDATE OR DELETE ON public.financial_records
FOR EACH ROW
EXECUTE FUNCTION public.log_accounting_event();