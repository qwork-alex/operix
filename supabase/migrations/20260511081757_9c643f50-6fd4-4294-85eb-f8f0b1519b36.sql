-- Phase B3.2: SELECT Isolation Hardening
-- Root cause: RLS was DISABLED on these tables; policies existed but were ignored.

ALTER TABLE public.service_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users       ENABLE ROW LEVEL SECURITY;

-- Defensive: also FORCE so table owners (non service_role) cannot bypass.
ALTER TABLE public.service_orders  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_users       FORCE ROW LEVEL SECURITY;

-- Audit entry
INSERT INTO public.rls_validation_logs (phase, check_name, sample)
VALUES (
  'B3.2',
  'enable_rls_core_tables',
  jsonb_build_object(
    'tables', jsonb_build_array('service_orders','payment_orders','profiles','app_users'),
    'reason', 'RLS was disabled on these tables causing cross-user SELECT leakage. Existing policies were not enforced.',
    'action', 'ENABLE + FORCE ROW LEVEL SECURITY'
  )
);