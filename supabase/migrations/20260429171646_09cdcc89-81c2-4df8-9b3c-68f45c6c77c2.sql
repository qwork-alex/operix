ALTER TABLE public.service_orders DISABLE TRIGGER USER;
ALTER TABLE public.payment_orders DISABLE TRIGGER USER;

UPDATE public.service_orders so
SET user_id = au.auth_user_id,
    assigned_user_id = au.auth_user_id,
    updated_at = now()
FROM public.app_users au
WHERE au.auth_user_id IS NOT NULL
  AND so.technician_name IS NOT NULL
  AND btrim(so.technician_name) <> ''
  AND lower(btrim(so.technician_name)) IN (lower(btrim(au.name)), lower(btrim(au.email)))
  AND (so.user_id IS DISTINCT FROM au.auth_user_id OR so.assigned_user_id IS DISTINCT FROM au.auth_user_id);

UPDATE public.payment_orders po
SET user_id = au.auth_user_id,
    assigned_user_id = au.auth_user_id,
    updated_at = now()
FROM public.app_users au
WHERE au.auth_user_id IS NOT NULL
  AND po.technician_name IS NOT NULL
  AND btrim(po.technician_name) <> ''
  AND lower(btrim(po.technician_name)) IN (lower(btrim(au.name)), lower(btrim(au.email)))
  AND (po.user_id IS DISTINCT FROM au.auth_user_id OR po.assigned_user_id IS DISTINCT FROM au.auth_user_id);

ALTER TABLE public.service_orders ENABLE TRIGGER USER;
ALTER TABLE public.payment_orders ENABLE TRIGGER USER;