
-- Fase A1: Endurecimento RLS sem risco

-- 1. Tabela de validação RLS
CREATE TABLE IF NOT EXISTS public.rls_validation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase text NOT NULL,
  check_name text NOT NULL,
  before_count bigint,
  after_count bigint,
  sample jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rls_validation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY rvl_admin_all ON public.rls_validation_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. P2 — discrepancies SELECT restrita
DROP POLICY IF EXISTS discrepancies_select_authenticated ON public.discrepancies;
CREATE POLICY discrepancies_select_scoped ON public.discrepancies
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = discrepancies.service_order_id
        AND (so.user_id = auth.uid() OR so.assigned_user_id = auth.uid() OR so.created_by = auth.uid())
    )
  );

-- 3. P3 — drivers SELECT restrita
DROP POLICY IF EXISTS drv_select ON public.drivers;
CREATE POLICY drv_select ON public.drivers
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR created_by = auth.uid()
  );

-- 4. P4 — service_order_distributions SELECT amplia para dono da SO
DROP POLICY IF EXISTS sod_admin_partner_select ON public.service_order_distributions;
CREATE POLICY sod_select_scoped ON public.service_order_distributions
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'partner'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_distributions.service_order_id
        AND (so.user_id = auth.uid() OR so.assigned_user_id = auth.uid() OR so.created_by = auth.uid())
    )
  );

-- 5. P7 — owner fallback por flag (mantém regra de email)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_system_owner boolean NOT NULL DEFAULT false;

-- Marcar owner atual pela flag
UPDATE public.profiles p
SET is_system_owner = true
WHERE EXISTS (
  SELECT 1 FROM auth.users u
  WHERE u.id = p.id AND lower(u.email) = 'qwork@qworkgroup.com'
);

CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = _user_id AND is_system_owner = true
    )
    OR EXISTS (
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
$function$;
