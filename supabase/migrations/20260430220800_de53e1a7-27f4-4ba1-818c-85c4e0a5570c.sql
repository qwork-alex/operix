-- =====================================================================
-- FASE 1.5: Bloqueio em RLS de usuários banidos
-- Embutimos a checagem de "ativo" nas funções centrais que TODAS as RLS
-- já chamam. Assim, nenhuma policy precisa ser reescrita.
-- =====================================================================

-- 1) is_user_active: protege o owner (defesa em profundidade)
CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- owner SEMPRE ativo (proteção extra contra bug que banisse o owner)
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = _user_id
        AND lower(email) = 'qwork@qworkgroup.com'
    )
    OR NOT EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = _user_id
        AND banned_until IS NOT NULL
        AND banned_until > now()
    );
$$;

-- 2) has_role: passa a retornar false se o usuário estiver banido
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_user_active(_user_id)
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    );
$$;

-- 3) can_manage_all_orders: idem (admin/partner banido não gerencia nada)
CREATE OR REPLACE FUNCTION public.can_manage_all_orders(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_user_active(_user_id)
    AND (
      public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'partner'::public.app_role)
    );
$$;