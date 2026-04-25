-- 1) Add nullable workspace_id columns (idempotent)
ALTER TABLE public.app_users      ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.technicians    ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.documents      ADD COLUMN IF NOT EXISTS workspace_id uuid;

-- 2) Ensure a "Default Workspace" exists
DO $$
DECLARE
  v_default_ws_id uuid;
  v_owner_app_user_id uuid;
BEGIN
  SELECT id INTO v_default_ws_id
  FROM public.workspaces
  WHERE name = 'Default Workspace'
  LIMIT 1;

  IF v_default_ws_id IS NULL THEN
    -- Pick any existing app_user as nominal owner (owner_user_id is NOT NULL on workspaces)
    SELECT id INTO v_owner_app_user_id FROM public.app_users ORDER BY created_at ASC LIMIT 1;

    IF v_owner_app_user_id IS NULL THEN
      -- No users yet; nothing to backfill, skip creating workspace
      RETURN;
    END IF;

    INSERT INTO public.workspaces (name, owner_user_id)
    VALUES ('Default Workspace', v_owner_app_user_id)
    RETURNING id INTO v_default_ws_id;
  END IF;

  -- 3) Backfill existing rows that have no workspace_id yet
  UPDATE public.app_users      SET workspace_id = v_default_ws_id WHERE workspace_id IS NULL;
  UPDATE public.technicians    SET workspace_id = v_default_ws_id WHERE workspace_id IS NULL;
  UPDATE public.service_orders SET workspace_id = v_default_ws_id WHERE workspace_id IS NULL;
  UPDATE public.documents      SET workspace_id = v_default_ws_id WHERE workspace_id IS NULL;
END $$;

-- 4) Helpful indexes for future filtering (no constraints enforced)
CREATE INDEX IF NOT EXISTS idx_app_users_workspace_id      ON public.app_users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_technicians_workspace_id    ON public.technicians(workspace_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_workspace_id ON public.service_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_workspace_id      ON public.documents(workspace_id);