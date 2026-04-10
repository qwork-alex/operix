
-- Seed admin role for existing main user
INSERT INTO public.user_roles (user_id, role)
VALUES ('7ebc5b1d-b12c-44bb-af44-836c09e340ae', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Seed technician role for second user
INSERT INTO public.user_roles (user_id, role)
VALUES ('4d240a1a-7820-4b90-8013-e9685b678b82', 'technician')
ON CONFLICT (user_id, role) DO NOTHING;

-- Create a secure function to get the current user's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1
$$;
