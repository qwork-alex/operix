-- 1) Safeguard: prevent duplicate technicians per user (only when user_id is set)
CREATE UNIQUE INDEX IF NOT EXISTS technicians_user_id_unique
  ON public.technicians(user_id)
  WHERE user_id IS NOT NULL;

-- 2) Backfill: create a technician for every app_user that doesn't have one
WITH inserted AS (
  INSERT INTO public.technicians (user_id, workspace_id, name, email)
  SELECT
    au.auth_user_id,
    au.workspace_id,
    COALESCE(NULLIF(au.name, ''), split_part(au.email, '@', 1), 'Técnico'),
    au.email
  FROM public.app_users au
  WHERE au.auth_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.technicians t WHERE t.user_id = au.auth_user_id
    )
  RETURNING id, user_id, name, email
)
INSERT INTO public.backend_event_logs (table_name, action, row_id, payload)
SELECT 'technicians', 'BACKFILL_AUTO_CREATE', i.id,
       jsonb_build_object('user_id', i.user_id, 'name', i.name, 'email', i.email)
FROM inserted i;

-- 3) Trigger: auto-create technician for every new app_user
CREATE OR REPLACE FUNCTION public.auto_create_technician_for_app_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.technicians WHERE user_id = NEW.auth_user_id
  ) THEN
    INSERT INTO public.technicians (user_id, workspace_id, name, email)
    VALUES (
      NEW.auth_user_id,
      NEW.workspace_id,
      COALESCE(NULLIF(NEW.name, ''), split_part(NEW.email, '@', 1), 'Técnico'),
      NEW.email
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_users_auto_create_technician ON public.app_users;
CREATE TRIGGER trg_app_users_auto_create_technician
AFTER INSERT ON public.app_users
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_technician_for_app_user();