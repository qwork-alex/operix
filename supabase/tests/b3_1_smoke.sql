-- =========================================================
-- Phase B3.1 smoke tests (read-only assertions)
-- Run as service_role to inspect policy & function state.
-- =========================================================

-- 1) Sync triggers must be SECURITY DEFINER
SELECT proname,
       prosecdef AS is_security_definer
FROM pg_proc
WHERE proname IN (
  'sync_discrepancy_for_service_order',
  'run_discrepancy_sync_trigger',
  'sync_financial_records_from_orders'
);
-- Expect: prosecdef = true for all three.

-- 2) clients SELECT policy must NOT be the wide-open one
SELECT polname FROM pg_policy
WHERE polrelid = 'public.clients'::regclass AND polcmd = 'r';
-- Expect: clients_select_scoped (not clients_select_authenticated).

-- 3) technicians SELECT policy rewritten
SELECT polname FROM pg_policy
WHERE polrelid = 'public.technicians'::regclass AND polcmd = 'r';
-- Expect: tech_select_scoped present, no policy with broad has_permission ORs.

-- 4) Validation log row
SELECT phase, check_name, created_at
FROM public.rls_validation_logs
WHERE phase = 'B3.1'
ORDER BY created_at DESC LIMIT 1;

-- 5) (Manual) save flow: as a technician user, INSERT a service_order
--    with total > 0; the discrepancies row must be auto-created
--    without RLS error.
--    SET LOCAL ROLE authenticated;
--    SET LOCAL "request.jwt.claim.sub" TO '<tech-uuid>';
--    INSERT INTO public.service_orders(client_name, technician_name, total, status)
--    VALUES ('X','Y',100,'pending');
--    SELECT * FROM public.discrepancies ORDER BY created_at DESC LIMIT 1;

-- 6) (Manual) Cross-user SELECT: as test4, should NOT see test5's
--    clients/technicians/SOs.
--    SET LOCAL "request.jwt.claim.sub" TO '<test4-uuid>';
--    SELECT count(*) FROM public.clients;       -- only own/admin/partner-linked
--    SELECT count(*) FROM public.technicians;   -- only own + partner-linked
--    SELECT count(*) FROM public.service_orders; -- only own
