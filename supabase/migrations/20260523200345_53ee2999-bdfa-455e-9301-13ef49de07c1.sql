
-- =========================================================
-- PHASE A — Backfill profiles.display_code
-- =========================================================
UPDATE public.profiles p
SET display_code = 'S' || lpad(nextval('public.partner_display_seq')::text, 5, '0')
WHERE (p.display_code IS NULL OR p.display_code = '')
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role IN ('admin','partner')
  );

UPDATE public.profiles p
SET display_code = t.display_code
FROM public.technicians t
WHERE t.user_id = p.id
  AND (p.display_code IS NULL OR p.display_code = '')
  AND t.display_code IS NOT NULL;

UPDATE public.profiles p
SET display_code = 'T' || lpad(nextval('public.technician_display_seq')::text, 5, '0')
WHERE (p.display_code IS NULL OR p.display_code = '')
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'technician'
  );

UPDATE public.profiles p
SET display_code = 'C' || lpad(nextval('public.client_display_seq')::text, 5, '0')
WHERE (p.display_code IS NULL OR p.display_code = '')
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'client'
  );

CREATE INDEX IF NOT EXISTS idx_profiles_display_code ON public.profiles(display_code);

-- =========================================================
-- PHASE B — workspace_invites (uses membership_role enum)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  target_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.membership_role NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_invites_pending
  ON public.workspace_invites(workspace_id, target_profile_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_workspace_invites_target ON public.workspace_invites(target_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON public.workspace_invites(workspace_id, status);

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_invites_owner_select" ON public.workspace_invites;
CREATE POLICY "workspace_invites_owner_select" ON public.workspace_invites
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.workspace_id = workspace_invites.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin','socio')
        AND m.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_invites.workspace_id AND w.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workspace_invites_target_select" ON public.workspace_invites;
CREATE POLICY "workspace_invites_target_select" ON public.workspace_invites
  FOR SELECT TO authenticated
  USING (target_profile_id = auth.uid());

-- =========================================================
-- PHASE C — Helpers
-- =========================================================
CREATE OR REPLACE FUNCTION public.find_profile_by_display_code(_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := upper(trim(_code));
  v_id UUID;
BEGIN
  IF v_code IS NULL OR v_code = '' THEN RETURN NULL; END IF;

  SELECT id INTO v_id FROM public.profiles WHERE upper(display_code) = v_code LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT user_id INTO v_id FROM public.technicians
  WHERE upper(display_code) = v_code AND user_id IS NOT NULL LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT user_id INTO v_id FROM public.clients
  WHERE upper(display_code) = v_code AND user_id IS NOT NULL LIMIT 1;

  RETURN v_id;
END;
$$;

-- =========================================================
-- PHASE D — RPCs
-- =========================================================
CREATE OR REPLACE FUNCTION public.create_workspace_invite_by_code(
  _workspace_id UUID,
  _display_code TEXT,
  _role public.membership_role
)
RETURNS public.workspace_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target UUID;
  v_caller UUID := auth.uid();
  v_can BOOLEAN;
  v_invite public.workspace_invites;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w WHERE w.id = _workspace_id AND w.owner_user_id = v_caller
  ) OR EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.workspace_id = _workspace_id AND m.user_id = v_caller
      AND m.role IN ('admin','socio') AND m.status = 'active'
  ) INTO v_can;
  IF NOT v_can THEN RAISE EXCEPTION 'Sem permissão para convidar neste workspace'; END IF;

  v_target := public.find_profile_by_display_code(_display_code);
  IF v_target IS NULL THEN RAISE EXCEPTION 'ID % não encontrado', _display_code; END IF;
  IF v_target = v_caller THEN RAISE EXCEPTION 'Você não pode convidar a si mesmo'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.memberships
    WHERE workspace_id = _workspace_id AND user_id = v_target AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Usuário já é membro deste workspace';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workspace_invites
    WHERE workspace_id = _workspace_id AND target_profile_id = v_target AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Já existe um convite pendente para este usuário';
  END IF;

  INSERT INTO public.workspace_invites (workspace_id, target_profile_id, role, created_by)
  VALUES (_workspace_id, v_target, _role, v_caller)
  RETURNING * INTO v_invite;
  RETURN v_invite;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_workspace_invite(_invite_id UUID)
RETURNS public.memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_invite public.workspace_invites;
  v_membership public.memberships;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_invite FROM public.workspace_invites WHERE id = _invite_id;
  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Convite não encontrado'; END IF;
  IF v_invite.target_profile_id <> v_caller THEN RAISE EXCEPTION 'Este convite não é para você'; END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'Convite já foi respondido'; END IF;

  INSERT INTO public.memberships (user_id, workspace_id, role, status, source)
  VALUES (v_caller, v_invite.workspace_id, v_invite.role, 'active', 'workspace_invite')
  ON CONFLICT (user_id, workspace_id) DO UPDATE
    SET role = EXCLUDED.role, status = 'active', source = 'workspace_invite'
  RETURNING * INTO v_membership;

  UPDATE public.workspace_invites
    SET status = 'accepted', responded_at = now()
  WHERE id = _invite_id;

  RETURN v_membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_workspace_invite(_invite_id UUID)
RETURNS public.workspace_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_invite public.workspace_invites;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_invite FROM public.workspace_invites WHERE id = _invite_id;
  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Convite não encontrado'; END IF;
  IF v_invite.target_profile_id <> v_caller THEN RAISE EXCEPTION 'Este convite não é para você'; END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'Convite já foi respondido'; END IF;

  UPDATE public.workspace_invites
    SET status = 'rejected', responded_at = now()
  WHERE id = _invite_id
  RETURNING * INTO v_invite;
  RETURN v_invite;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_workspace_invite(_invite_id UUID)
RETURNS public.workspace_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_invite public.workspace_invites;
  v_can BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_invite FROM public.workspace_invites WHERE id = _invite_id;
  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Convite não encontrado'; END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'Convite já foi respondido'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w WHERE w.id = v_invite.workspace_id AND w.owner_user_id = v_caller
  ) OR EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.workspace_id = v_invite.workspace_id AND m.user_id = v_caller
      AND m.role IN ('admin','socio') AND m.status = 'active'
  ) INTO v_can;
  IF NOT v_can THEN RAISE EXCEPTION 'Sem permissão para cancelar este convite'; END IF;

  UPDATE public.workspace_invites
    SET status = 'cancelled', responded_at = now()
  WHERE id = _invite_id
  RETURNING * INTO v_invite;
  RETURN v_invite;
END;
$$;

-- =========================================================
-- PHASE E — handle_new_user: support independent technician signup
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_intended TEXT := NEW.raw_user_meta_data->>'intended_role';
  v_full_name TEXT := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, v_full_name, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  IF v_intended = 'tecnico' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'technician')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.technicians (user_id, name, email)
    VALUES (NEW.id, NULLIF(v_full_name,''), NEW.email)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
