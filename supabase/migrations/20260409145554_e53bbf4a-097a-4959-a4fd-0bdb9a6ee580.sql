-- Fix existing owners with wrong roles
UPDATE public.memberships m
SET role = 'admin'
FROM public.workspaces w
WHERE w.owner_user_id = m.user_id
  AND m.workspace_id = w.id
  AND m.role != 'admin';

-- Create trigger to protect workspace owner role
CREATE OR REPLACE FUNCTION public.protect_workspace_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Prevent changing the role of a workspace owner away from admin
  IF TG_OP = 'UPDATE' AND NEW.role != 'admin' THEN
    IF EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE id = NEW.workspace_id AND owner_user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Cannot change role of workspace owner. The owner must always be admin.';
    END IF;
  END IF;

  -- Prevent deleting the membership of a workspace owner
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE id = OLD.workspace_id AND owner_user_id = OLD.user_id
    ) THEN
      RAISE EXCEPTION 'Cannot remove workspace owner from workspace.';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_owner_role
BEFORE UPDATE OR DELETE ON public.memberships
FOR EACH ROW
EXECUTE FUNCTION public.protect_workspace_owner_role();