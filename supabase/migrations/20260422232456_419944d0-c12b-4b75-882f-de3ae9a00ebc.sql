-- Scope enum
DO $$ BEGIN
  CREATE TYPE public.permission_scope AS ENUM ('own', 'team', 'all');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- role_permissions.scope
ALTER TABLE public.role_permissions
  ADD COLUMN IF NOT EXISTS scope public.permission_scope NOT NULL DEFAULT 'all';

-- user_permissions.scope
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS scope public.permission_scope NOT NULL DEFAULT 'all';

-- Backfill (no-op if defaults already applied)
UPDATE public.role_permissions SET scope = 'all' WHERE scope IS NULL;
UPDATE public.user_permissions SET scope = 'all' WHERE scope IS NULL;