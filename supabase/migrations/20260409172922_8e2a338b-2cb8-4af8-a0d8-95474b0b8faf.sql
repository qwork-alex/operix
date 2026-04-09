
-- Add source column to memberships
ALTER TABLE public.memberships
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system';

-- Create invites table
CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  role public.membership_role NOT NULL DEFAULT 'tecnico',
  email text,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_type text NOT NULL DEFAULT 'link',
  short_code text,
  expires_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invites_token_unique UNIQUE (token),
  CONSTRAINT invites_short_code_unique UNIQUE (short_code)
);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view invites"
ON public.invites FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert invites"
ON public.invites FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update invites"
ON public.invites FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL);

-- Function to generate short codes
CREATE OR REPLACE FUNCTION public.generate_invite_short_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  LOOP
    v_code := upper(substr(md5(random()::text), 1, 2)) || '-' || upper(substr(md5(random()::text), 1, 4));
    SELECT EXISTS (SELECT 1 FROM public.invites WHERE short_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  NEW.short_code := v_code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_invite_short_code
BEFORE INSERT ON public.invites
FOR EACH ROW
WHEN (NEW.short_code IS NULL)
EXECUTE FUNCTION public.generate_invite_short_code();

-- Create user_usage table
CREATE TABLE public.user_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  total_workspaces integer NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage"
ON public.user_usage FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "System can manage usage"
ON public.user_usage FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Function to update user_usage on membership changes
CREATE OR REPLACE FUNCTION public.update_user_usage_on_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_count integer;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  
  SELECT COUNT(*) INTO v_count
  FROM public.memberships
  WHERE user_id = v_user_id AND status = 'active';

  INSERT INTO public.user_usage (user_id, total_workspaces, last_updated)
  VALUES (v_user_id, v_count, now())
  ON CONFLICT (user_id) DO UPDATE
  SET total_workspaces = v_count, last_updated = now();

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_update_user_usage
AFTER INSERT OR UPDATE OR DELETE ON public.memberships
FOR EACH ROW
EXECUTE FUNCTION public.update_user_usage_on_membership();

-- Log invite events
CREATE TRIGGER trg_log_invite_events
AFTER INSERT OR UPDATE ON public.invites
FOR EACH ROW
EXECUTE FUNCTION public.log_backend_event();
