-- =====================================================================
-- FASE 1 (corrigida): Preparação de base RBAC
-- - Não cria índices (já existe o unique constraint memberships_user_id_workspace_id_key)
-- - DISTINCT ON garante 1 linha por (user_id, workspace_id)
-- - ON CONFLICT DO NOTHING como segurança extra
-- =====================================================================

-- 1) Popular memberships a partir de user_roles (idempotente, sem duplicatas).
INSERT INTO public.memberships (user_id, workspace_id, role, status, source)
SELECT user_id, workspace_id, role, status, source
FROM (
  SELECT DISTINCT ON (au.id, COALESCE(au.workspace_id, w.id))
    au.id                                               AS user_id,
    COALESCE(au.workspace_id, w.id)                     AS workspace_id,
    (CASE ur.role::text
       WHEN 'admin'      THEN 'admin'
       WHEN 'partner'    THEN 'socio'
       WHEN 'technician' THEN 'tecnico'
       WHEN 'client'     THEN 'cliente'
       ELSE 'tecnico'
     END)::public.membership_role                       AS role,
    'active'::public.membership_status                  AS status,
    'backfill_user_roles'                               AS source
  FROM public.user_roles ur
  JOIN public.app_users  au ON au.auth_user_id = ur.user_id
  LEFT JOIN public.workspaces w ON w.owner_user_id = au.id
  WHERE COALESCE(au.workspace_id, w.id) IS NOT NULL
  ORDER BY
    au.id,
    COALESCE(au.workspace_id, w.id),
    -- prioriza o role mais alto se houver duplicidade no user_roles
    (CASE ur.role::text
       WHEN 'admin' THEN 0
       WHEN 'partner' THEN 1
       WHEN 'technician' THEN 2
       WHEN 'client' THEN 3
       ELSE 4
     END)
) src
ON CONFLICT (user_id, workspace_id) DO NOTHING;

-- 2) Função canônica para uso FUTURO: effective_role(auth_user_id, workspace_id)
CREATE OR REPLACE FUNCTION public.effective_role(_user_id uuid, _workspace_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH m AS (
    SELECT mem.role::text AS role
    FROM public.memberships mem
    JOIN public.app_users au ON au.id = mem.user_id
    WHERE au.auth_user_id = _user_id
      AND mem.workspace_id = _workspace_id
      AND mem.status = 'active'
    LIMIT 1
  ),
  r AS (
    SELECT (CASE ur.role::text
              WHEN 'admin'      THEN 'admin'
              WHEN 'partner'    THEN 'socio'
              WHEN 'technician' THEN 'tecnico'
              WHEN 'client'     THEN 'cliente'
              ELSE NULL
            END) AS role
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
    LIMIT 1
  )
  SELECT COALESCE((SELECT role FROM m), (SELECT role FROM r));
$$;

-- 3) Helper: role efetivo do usuário autenticado no seu workspace atual.
CREATE OR REPLACE FUNCTION public.current_user_effective_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.effective_role(
    auth.uid(),
    (SELECT workspace_id FROM public.app_users WHERE auth_user_id = auth.uid() LIMIT 1)
  );
$$;

-- 4) Permissão de execução (leitura apenas).
GRANT EXECUTE ON FUNCTION public.effective_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_effective_role() TO authenticated;