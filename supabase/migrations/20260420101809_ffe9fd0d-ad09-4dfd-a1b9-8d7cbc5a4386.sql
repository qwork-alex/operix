
-- =========================================================
-- TABELA: permissions (catálogo)
-- =========================================================
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  action text NOT NULL CHECK (action IN ('view','create','edit','delete')),
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(module, action)
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permissions_select_authenticated"
ON public.permissions FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "permissions_admin_all"
ON public.permissions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- TABELA: role_permissions (defaults por role)
-- =========================================================
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role, permission_id)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_permissions_select_authenticated"
ON public.role_permissions FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "role_permissions_admin_all"
ON public.role_permissions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- TABELA: user_permissions (overrides individuais)
-- =========================================================
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  allow boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  UNIQUE(user_id, permission_id)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_permissions_select_self_or_admin"
ON public.user_permissions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_permissions_admin_all"
ON public.user_permissions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- HELPER: has_permission(user_id, module, action)
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perm_id uuid;
  v_override boolean;
  v_role_has boolean;
  v_user_role public.app_role;
BEGIN
  -- Admin = sempre true
  IF public.has_role(_user_id, 'admin') THEN
    RETURN true;
  END IF;

  -- Resolver permission_id
  SELECT id INTO v_perm_id
  FROM public.permissions
  WHERE module = _module AND action = _action
  LIMIT 1;

  IF v_perm_id IS NULL THEN
    RETURN false;
  END IF;

  -- Override individual?
  SELECT allow INTO v_override
  FROM public.user_permissions
  WHERE user_id = _user_id AND permission_id = v_perm_id
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  -- Default por role
  SELECT role INTO v_user_role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role = v_user_role AND permission_id = v_perm_id
  ) INTO v_role_has;

  RETURN COALESCE(v_role_has, false);
END;
$$;

-- =========================================================
-- SEED: catálogo de permissões (10 módulos × 4 ações)
-- =========================================================
INSERT INTO public.permissions (module, action, label) VALUES
  ('dashboard','view','Ver Dashboard'),
  ('dashboard','create','Criar no Dashboard'),
  ('dashboard','edit','Editar no Dashboard'),
  ('dashboard','delete','Apagar no Dashboard'),
  ('service_orders','view','Ver Ordens de Serviço'),
  ('service_orders','create','Criar Ordens de Serviço'),
  ('service_orders','edit','Editar Ordens de Serviço'),
  ('service_orders','delete','Apagar Ordens de Serviço'),
  ('payment_orders','view','Ver Ordens de Pagamento'),
  ('payment_orders','create','Criar Ordens de Pagamento'),
  ('payment_orders','edit','Editar Ordens de Pagamento'),
  ('payment_orders','delete','Apagar Ordens de Pagamento'),
  ('financial','view','Ver Financeiro'),
  ('financial','create','Criar registos Financeiros'),
  ('financial','edit','Editar Financeiro'),
  ('financial','delete','Apagar Financeiro'),
  ('profit','view','Ver Distribuição de Lucros'),
  ('profit','create','Criar Regras de Lucro'),
  ('profit','edit','Editar Regras de Lucro'),
  ('profit','delete','Apagar Regras de Lucro'),
  ('accounting','view','Ver Contabilidade'),
  ('accounting','create','Criar Lançamentos'),
  ('accounting','edit','Editar Contabilidade'),
  ('accounting','delete','Apagar Contabilidade'),
  ('fleet','view','Ver Frota'),
  ('fleet','create','Criar registos de Frota'),
  ('fleet','edit','Editar Frota'),
  ('fleet','delete','Apagar Frota'),
  ('documents','view','Ver Documentos'),
  ('documents','create','Carregar Documentos'),
  ('documents','edit','Editar Documentos'),
  ('documents','delete','Apagar Documentos'),
  ('users','view','Ver Utilizadores'),
  ('users','create','Criar Utilizadores'),
  ('users','edit','Editar Utilizadores'),
  ('users','delete','Apagar Utilizadores'),
  ('settings','view','Ver Configurações'),
  ('settings','create','Criar Configurações'),
  ('settings','edit','Editar Configurações'),
  ('settings','delete','Apagar Configurações');

-- =========================================================
-- SEED: defaults por role
-- =========================================================
-- ADMIN: tudo (mas has_permission já devolve true direto; mesmo assim populamos para a UI)
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin'::public.app_role, id FROM public.permissions;

-- PARTNER (sócio): vê tudo operacional + financeiro, edita pouco
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'partner'::public.app_role, id FROM public.permissions
WHERE (module, action) IN (
  ('dashboard','view'),
  ('service_orders','view'),
  ('payment_orders','view'),
  ('financial','view'),
  ('profit','view'),
  ('documents','view'),
  ('documents','create')
);

-- TECHNICIAN (técnico): vê SOs próprias, frota, docs
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'technician'::public.app_role, id FROM public.permissions
WHERE (module, action) IN (
  ('dashboard','view'),
  ('service_orders','view'),
  ('fleet','view'),
  ('fleet','create'),
  ('fleet','edit'),
  ('documents','view'),
  ('documents','create')
);

-- CLIENT (cliente): apenas dashboard + ver SOs próprias
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'client'::public.app_role, id FROM public.permissions
WHERE (module, action) IN (
  ('dashboard','view'),
  ('service_orders','view')
);
