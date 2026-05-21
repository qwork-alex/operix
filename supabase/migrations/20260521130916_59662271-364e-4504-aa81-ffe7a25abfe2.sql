
-- =========================================================================
-- Phase 5.5 — Compliance, GDPR, Anti-Fraud & Security Hardening
-- =========================================================================

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE public.consent_action AS ENUM ('granted', 'withdrawn', 'updated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fraud_severity AS ENUM ('info', 'low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fraud_status AS ENUM ('open', 'reviewing', 'cleared', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.deletion_status AS ENUM ('pending', 'scheduled', 'executing', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.export_status AS ENUM ('queued', 'processing', 'ready', 'failed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- TABLES ----------

CREATE TABLE IF NOT EXISTS public.consent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid,
  consent_key text NOT NULL,
  action public.consent_action NOT NULL,
  terms_version text,
  locale text,
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consent_logs_user ON public.consent_logs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.data_retention_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  entity text NOT NULL,
  retention_days int NOT NULL CHECK (retention_days > 0),
  action text NOT NULL DEFAULT 'anonymize',
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_privacy_settings (
  user_id uuid PRIMARY KEY,
  marketing_emails boolean NOT NULL DEFAULT false,
  analytics_tracking boolean NOT NULL DEFAULT true,
  ai_training_optin boolean NOT NULL DEFAULT false,
  share_usage_data boolean NOT NULL DEFAULT false,
  preferred_locale text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.immutable_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  actor_user_id uuid,
  category text NOT NULL,
  action text NOT NULL,
  resource text,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash text,
  row_hash text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_immutable_audit_workspace ON public.immutable_audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_immutable_audit_category ON public.immutable_audit_logs(category, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fraud_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id uuid,
  signal_type text NOT NULL,
  severity public.fraud_severity NOT NULL DEFAULT 'low',
  status public.fraud_status NOT NULL DEFAULT 'open',
  risk_score int NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  ip_address text,
  user_agent text,
  device_fingerprint text,
  country text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_user ON public.fraud_signals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_workspace ON public.fraud_signals(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid,
  device_fingerprint text NOT NULL,
  browser text,
  os text,
  device_type text,
  ip_address text,
  country text,
  city text,
  trusted boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_user_devices_user ON public.user_devices(user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.workspace_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  reason text,
  status public.deletion_status NOT NULL DEFAULT 'pending',
  retention_until timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  scheduled_for timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ws_deletion_workspace ON public.workspace_deletion_requests(workspace_id);

CREATE TABLE IF NOT EXISTS public.data_export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid,
  scope text NOT NULL DEFAULT 'profile',
  format text NOT NULL DEFAULT 'json',
  status public.export_status NOT NULL DEFAULT 'queued',
  file_path text,
  size_bytes bigint,
  expires_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.security_policies (
  workspace_id uuid PRIMARY KEY,
  session_timeout_minutes int NOT NULL DEFAULT 60 CHECK (session_timeout_minutes BETWEEN 5 AND 1440),
  max_login_attempts int NOT NULL DEFAULT 5 CHECK (max_login_attempts BETWEEN 3 AND 20),
  lockout_minutes int NOT NULL DEFAULT 15 CHECK (lockout_minutes BETWEEN 1 AND 240),
  mfa_required boolean NOT NULL DEFAULT false,
  enforce_strong_password boolean NOT NULL DEFAULT true,
  rotate_session_on_privilege_change boolean NOT NULL DEFAULT true,
  ip_allowlist text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- RLS ----------
ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_retention_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_privacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.immutable_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_policies ENABLE ROW LEVEL SECURITY;

-- Helper: detect platform owner by email (consistent with existing project pattern)
CREATE OR REPLACE FUNCTION public.is_system_owner_jwt()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND email = 'qwork@qworkgroup.com'
  );
$$;

-- consent_logs — user sees own; owner sees all; insert open to self; no update/delete
DROP POLICY IF EXISTS consent_logs_select_self ON public.consent_logs;
CREATE POLICY consent_logs_select_self ON public.consent_logs FOR SELECT
  USING (auth.uid() = user_id OR public.is_system_owner_jwt());
DROP POLICY IF EXISTS consent_logs_insert_self ON public.consent_logs;
CREATE POLICY consent_logs_insert_self ON public.consent_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- user_privacy_settings — self manage
DROP POLICY IF EXISTS ups_select_self ON public.user_privacy_settings;
CREATE POLICY ups_select_self ON public.user_privacy_settings FOR SELECT
  USING (auth.uid() = user_id OR public.is_system_owner_jwt());
DROP POLICY IF EXISTS ups_upsert_self ON public.user_privacy_settings;
CREATE POLICY ups_upsert_self ON public.user_privacy_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS ups_update_self ON public.user_privacy_settings;
CREATE POLICY ups_update_self ON public.user_privacy_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- immutable_audit_logs — read scoped, NO update/delete for anyone
DROP POLICY IF EXISTS audit_select_owner ON public.immutable_audit_logs;
CREATE POLICY audit_select_owner ON public.immutable_audit_logs FOR SELECT
  USING (public.is_system_owner_jwt() OR actor_user_id = auth.uid());

-- fraud_signals — owner reads all, user reads own
DROP POLICY IF EXISTS fraud_select ON public.fraud_signals;
CREATE POLICY fraud_select ON public.fraud_signals FOR SELECT
  USING (public.is_system_owner_jwt() OR user_id = auth.uid());

-- user_devices — self
DROP POLICY IF EXISTS devices_select_self ON public.user_devices;
CREATE POLICY devices_select_self ON public.user_devices FOR SELECT
  USING (auth.uid() = user_id OR public.is_system_owner_jwt());
DROP POLICY IF EXISTS devices_insert_self ON public.user_devices;
CREATE POLICY devices_insert_self ON public.user_devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS devices_update_self ON public.user_devices;
CREATE POLICY devices_update_self ON public.user_devices FOR UPDATE
  USING (auth.uid() = user_id OR public.is_system_owner_jwt());

-- workspace_deletion_requests — requester or owner
DROP POLICY IF EXISTS wsd_select ON public.workspace_deletion_requests;
CREATE POLICY wsd_select ON public.workspace_deletion_requests FOR SELECT
  USING (public.is_system_owner_jwt() OR requested_by = auth.uid());

-- data_export_requests — self
DROP POLICY IF EXISTS exp_select_self ON public.data_export_requests;
CREATE POLICY exp_select_self ON public.data_export_requests FOR SELECT
  USING (auth.uid() = user_id OR public.is_system_owner_jwt());

-- data_retention_rules / security_policies — owner manages, all authenticated read
DROP POLICY IF EXISTS dr_select ON public.data_retention_rules;
CREATE POLICY dr_select ON public.data_retention_rules FOR SELECT USING (true);
DROP POLICY IF EXISTS dr_owner_all ON public.data_retention_rules;
CREATE POLICY dr_owner_all ON public.data_retention_rules FOR ALL
  USING (public.is_system_owner_jwt()) WITH CHECK (public.is_system_owner_jwt());

DROP POLICY IF EXISTS sp_select ON public.security_policies;
CREATE POLICY sp_select ON public.security_policies FOR SELECT USING (true);
DROP POLICY IF EXISTS sp_owner_all ON public.security_policies;
CREATE POLICY sp_owner_all ON public.security_policies FOR ALL
  USING (public.is_system_owner_jwt()) WITH CHECK (public.is_system_owner_jwt());

-- ---------- RPCs ----------

CREATE OR REPLACE FUNCTION public.record_consent(
  _consent_key text,
  _action public.consent_action,
  _terms_version text DEFAULT NULL,
  _workspace_id uuid DEFAULT NULL,
  _locale text DEFAULT NULL,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.consent_logs(user_id, workspace_id, consent_key, action, terms_version, locale, ip_address, user_agent, metadata)
  VALUES (auth.uid(), _workspace_id, _consent_key, _action, _terms_version, _locale, _ip, _user_agent, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.write_immutable_log(
  _category text,
  _action text,
  _resource text DEFAULT NULL,
  _resource_id text DEFAULT NULL,
  _workspace_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prev text;
  v_payload text;
  v_hash text;
  v_id uuid;
BEGIN
  SELECT row_hash INTO v_prev FROM public.immutable_audit_logs
    ORDER BY created_at DESC LIMIT 1;
  v_payload := COALESCE(v_prev, '') || '|' || _category || '|' || _action || '|' ||
               COALESCE(_resource, '') || '|' || COALESCE(_resource_id, '') || '|' ||
               COALESCE(_workspace_id::text, '') || '|' || COALESCE(auth.uid()::text, '') || '|' ||
               COALESCE(_metadata::text, '{}') || '|' || now()::text;
  v_hash := encode(digest(v_payload, 'sha256'), 'hex');
  INSERT INTO public.immutable_audit_logs(
    workspace_id, actor_user_id, category, action, resource, resource_id,
    metadata, prev_hash, row_hash, ip_address, user_agent
  ) VALUES (
    _workspace_id, auth.uid(), _category, _action, _resource, _resource_id,
    COALESCE(_metadata, '{}'::jsonb), v_prev, v_hash, _ip, _user_agent
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.request_data_export(
  _scope text DEFAULT 'profile',
  _format text DEFAULT 'json',
  _workspace_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.data_export_requests(user_id, workspace_id, scope, format, status, expires_at)
  VALUES (auth.uid(), _workspace_id, _scope, _format, 'queued', now() + interval '7 days')
  RETURNING id INTO v_id;
  PERFORM public.write_immutable_log('gdpr', 'data_export_requested', 'data_export', v_id::text, _workspace_id,
    jsonb_build_object('scope', _scope, 'format', _format));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.request_workspace_deletion(
  _workspace_id uuid,
  _reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.workspace_deletion_requests(workspace_id, requested_by, reason, status, scheduled_for)
  VALUES (_workspace_id, auth.uid(), _reason, 'scheduled', now() + interval '30 days')
  RETURNING id INTO v_id;
  PERFORM public.write_immutable_log('admin', 'workspace_deletion_requested', 'workspace', _workspace_id::text, _workspace_id,
    jsonb_build_object('reason', _reason));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_workspace_deletion(_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.workspace_deletion_requests
    SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
  WHERE id = _request_id AND (requested_by = auth.uid() OR public.is_system_owner_jwt())
    AND status IN ('pending', 'scheduled');
  PERFORM public.write_immutable_log('admin', 'workspace_deletion_cancelled', 'deletion_request', _request_id::text, NULL, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.register_device(
  _fingerprint text,
  _browser text DEFAULT NULL,
  _os text DEFAULT NULL,
  _device_type text DEFAULT NULL,
  _ip text DEFAULT NULL,
  _country text DEFAULT NULL,
  _city text DEFAULT NULL,
  _workspace_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.user_devices(user_id, workspace_id, device_fingerprint, browser, os, device_type, ip_address, country, city)
  VALUES (auth.uid(), _workspace_id, _fingerprint, _browser, _os, _device_type, _ip, _country, _city)
  ON CONFLICT (user_id, device_fingerprint) DO UPDATE SET
    last_seen_at = now(),
    ip_address = COALESCE(EXCLUDED.ip_address, public.user_devices.ip_address),
    country = COALESCE(EXCLUDED.country, public.user_devices.country),
    city = COALESCE(EXCLUDED.city, public.user_devices.city),
    revoked_at = NULL
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_device(_device_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.user_devices SET revoked_at = now()
  WHERE id = _device_id AND (user_id = auth.uid() OR public.is_system_owner_jwt());
  PERFORM public.write_immutable_log('auth', 'device_revoked', 'user_device', _device_id::text, NULL, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.revoke_all_devices()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.user_devices SET revoked_at = now()
  WHERE user_id = auth.uid() AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.write_immutable_log('auth', 'all_devices_revoked', 'user_device', auth.uid()::text, NULL,
    jsonb_build_object('count', v_count));
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.record_fraud_signal(
  _signal_type text,
  _severity public.fraud_severity DEFAULT 'low',
  _risk_score int DEFAULT 0,
  _user_id uuid DEFAULT NULL,
  _workspace_id uuid DEFAULT NULL,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _device_fingerprint text DEFAULT NULL,
  _country text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.fraud_signals(
    workspace_id, user_id, signal_type, severity, risk_score,
    ip_address, user_agent, device_fingerprint, country, metadata
  ) VALUES (
    _workspace_id, COALESCE(_user_id, auth.uid()), _signal_type, _severity, GREATEST(0, LEAST(100, _risk_score)),
    _ip, _user_agent, _device_fingerprint, _country, COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;
  IF _severity IN ('high', 'critical') THEN
    PERFORM public.write_immutable_log('security', 'fraud_signal_' || _signal_type, 'fraud_signal', v_id::text, _workspace_id, _metadata);
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.compute_user_risk_score(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent int;
  v_max int;
  v_distinct_ips int;
  v_open int;
BEGIN
  SELECT count(*) INTO v_recent FROM public.fraud_signals
    WHERE user_id = _user_id AND created_at > now() - interval '30 days';
  SELECT COALESCE(max(risk_score), 0) INTO v_max FROM public.fraud_signals
    WHERE user_id = _user_id AND created_at > now() - interval '30 days';
  SELECT count(DISTINCT ip_address) INTO v_distinct_ips FROM public.user_devices
    WHERE user_id = _user_id AND last_seen_at > now() - interval '30 days';
  SELECT count(*) INTO v_open FROM public.fraud_signals
    WHERE user_id = _user_id AND status = 'open';
  RETURN jsonb_build_object(
    'user_id', _user_id,
    'recent_signals_30d', v_recent,
    'max_risk_score', v_max,
    'distinct_ips_30d', v_distinct_ips,
    'open_signals', v_open,
    'composite_score', LEAST(100, v_max + (v_open * 5) + GREATEST(0, (v_distinct_ips - 2) * 4)),
    'computed_at', now()
  );
END $$;

CREATE OR REPLACE FUNCTION public.compute_compliance_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'consents_total', (SELECT count(*) FROM public.consent_logs),
    'consents_30d', (SELECT count(*) FROM public.consent_logs WHERE created_at > now() - interval '30 days'),
    'export_requests_open', (SELECT count(*) FROM public.data_export_requests WHERE status IN ('queued', 'processing')),
    'deletion_requests_pending', (SELECT count(*) FROM public.workspace_deletion_requests WHERE status IN ('pending','scheduled')),
    'fraud_open_critical', (SELECT count(*) FROM public.fraud_signals WHERE status = 'open' AND severity IN ('high','critical')),
    'fraud_open_total', (SELECT count(*) FROM public.fraud_signals WHERE status = 'open'),
    'active_devices', (SELECT count(*) FROM public.user_devices WHERE revoked_at IS NULL AND last_seen_at > now() - interval '30 days'),
    'audit_logs_24h', (SELECT count(*) FROM public.immutable_audit_logs WHERE created_at > now() - interval '24 hours'),
    'audit_logs_total', (SELECT count(*) FROM public.immutable_audit_logs),
    'computed_at', now()
  ) INTO v;
  RETURN v;
END $$;

-- Seed sane defaults: retention rules
INSERT INTO public.data_retention_rules(workspace_id, entity, retention_days, action, notes)
SELECT NULL, e, d, a, n FROM (VALUES
  ('backend_event_logs', 365, 'delete', 'Operational event log retention'),
  ('security_events', 730, 'archive', '2-year security trail per industry baseline'),
  ('immutable_audit_logs', 2555, 'archive', '7-year retention for financial/legal audit'),
  ('consent_logs', 2555, 'archive', 'GDPR Article 7 — proof of consent'),
  ('fraud_signals', 365, 'archive', 'Anti-fraud baseline window')
) AS s(e, d, a, n)
WHERE NOT EXISTS (SELECT 1 FROM public.data_retention_rules WHERE entity = s.e AND workspace_id IS NULL);
