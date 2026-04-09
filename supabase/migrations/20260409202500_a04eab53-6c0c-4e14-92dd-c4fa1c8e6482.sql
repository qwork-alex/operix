
-- Disable the owner protection trigger
ALTER TABLE public.memberships DISABLE TRIGGER protect_owner_role;
ALTER TABLE public.memberships DISABLE TRIGGER trg_update_user_usage;

-- Delete all memberships except owner's
DELETE FROM public.memberships 
WHERE NOT (user_id = 'ac8910a6-5043-49a9-9365-25e82746a1d6' AND workspace_id = '55b0f5fe-5e48-4f11-aef2-bc7c8c4f7f6d');

-- Re-enable triggers
ALTER TABLE public.memberships ENABLE TRIGGER protect_owner_role;
ALTER TABLE public.memberships ENABLE TRIGGER trg_update_user_usage;

-- Clean other tables
DELETE FROM public.invites;
DELETE FROM public.backend_event_logs;
DELETE FROM public.user_usage WHERE user_id != 'ac8910a6-5043-49a9-9365-25e82746a1d6';
DELETE FROM public.user_roles WHERE user_id != '7ebc5b1d-b12c-44bb-af44-836c09e340ae';
DELETE FROM public.notifications WHERE user_id != '7ebc5b1d-b12c-44bb-af44-836c09e340ae';
DELETE FROM public.workspaces WHERE owner_user_id != 'ac8910a6-5043-49a9-9365-25e82746a1d6';
DELETE FROM public.app_users WHERE id != 'ac8910a6-5043-49a9-9365-25e82746a1d6';
DELETE FROM public.profiles WHERE id != '7ebc5b1d-b12c-44bb-af44-836c09e340ae';
