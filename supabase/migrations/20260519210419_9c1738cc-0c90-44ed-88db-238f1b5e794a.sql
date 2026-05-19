
CREATE TABLE IF NOT EXISTS public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version text NOT NULL,
  language text,
  ip_address text,
  user_agent text,
  accepted_terms boolean NOT NULL DEFAULT false,
  accepted_privacy boolean NOT NULL DEFAULT false,
  accepted_gdpr boolean NOT NULL DEFAULT false,
  accepted_data_storage boolean NOT NULL DEFAULT false,
  accepted_sharing_policy boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'accepted',
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_consents_user_id_idx ON public.user_consents(user_id);
CREATE INDEX IF NOT EXISTS user_consents_user_version_idx ON public.user_consents(user_id, terms_version);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_consents"
  ON public.user_consents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "users_insert_own_consents"
  ON public.user_consents FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_consents"
  ON public.user_consents FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
