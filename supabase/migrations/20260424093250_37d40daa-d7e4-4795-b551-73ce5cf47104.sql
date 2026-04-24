-- 0. Drop restrictive check constraint that limits action to view/create/edit/delete
ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS permissions_action_check;

-- 1. Insert new granular permission actions
INSERT INTO public.permissions (module, action, label) VALUES
  ('service_orders', 'upload_document',    'Carregar documento'),
  ('service_orders', 'scan_document',      'Digitalizar documento'),
  ('service_orders', 'assign_technician',  'Atribuir técnico'),
  ('service_orders', 'validate_data',      'Validar dados (OCR)'),
  ('service_orders', 'export_pdf',         'Exportar PDF'),
  ('financial',      'view_reports',       'Ver relatórios'),
  ('financial',      'export_reports',     'Exportar relatórios'),
  ('fleet',          'register_vehicle',   'Registar veículo'),
  ('fleet',          'register_driver',    'Registar condutor'),
  ('fleet',          'log_trip',           'Registar trajeto'),
  ('fleet',          'log_fuel',           'Registar abastecimento'),
  ('fleet',          'export_reports',     'Exportar relatórios')
ON CONFLICT DO NOTHING;

-- 2. Grant ALL new permissions to admin role
INSERT INTO public.role_permissions (role, permission_id, scope)
SELECT 'admin'::public.app_role, p.id, 'all'::public.permission_scope
FROM public.permissions p
WHERE (p.module, p.action) IN (
  ('service_orders', 'upload_document'),
  ('service_orders', 'scan_document'),
  ('service_orders', 'assign_technician'),
  ('service_orders', 'validate_data'),
  ('service_orders', 'export_pdf'),
  ('financial',      'view_reports'),
  ('financial',      'export_reports'),
  ('fleet',          'register_vehicle'),
  ('fleet',          'register_driver'),
  ('fleet',          'log_trip'),
  ('fleet',          'log_fuel'),
  ('fleet',          'export_reports')
)
ON CONFLICT DO NOTHING;

-- 3. Technician defaults (own scope, operational)
INSERT INTO public.role_permissions (role, permission_id, scope)
SELECT 'technician'::public.app_role, p.id, 'own'::public.permission_scope
FROM public.permissions p
WHERE (p.module, p.action) IN (
  ('service_orders', 'upload_document'),
  ('service_orders', 'scan_document'),
  ('service_orders', 'validate_data'),
  ('fleet',          'log_trip'),
  ('fleet',          'log_fuel')
)
ON CONFLICT DO NOTHING;

-- 4. Partner defaults (oversight + export)
INSERT INTO public.role_permissions (role, permission_id, scope)
SELECT 'partner'::public.app_role, p.id, 'all'::public.permission_scope
FROM public.permissions p
WHERE (p.module, p.action) IN (
  ('financial',      'view_reports'),
  ('financial',      'export_reports'),
  ('fleet',          'export_reports'),
  ('service_orders', 'export_pdf')
)
ON CONFLICT DO NOTHING;