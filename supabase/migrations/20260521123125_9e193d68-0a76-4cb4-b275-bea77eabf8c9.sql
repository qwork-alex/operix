
-- ============================================================
-- PHASE 4: SaaS Automation & Intelligence Layer
-- Additive only. No breaking changes.
-- ============================================================

-- 1. Notification helper -------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_workspace_admins(
  _workspace_id uuid,
  _type text,
  _title text,
  _message text,
  _entity_type text DEFAULT 'subscription',
  _entity_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO public.notifications (user_id, workspace_id, type, title, message, entity_type, entity_id)
  SELECT au.auth_user_id, _workspace_id, _type, _title, _message, _entity_type, _entity_id
  FROM public.memberships m
  JOIN public.app_users au ON au.id = m.user_id
  WHERE m.workspace_id = _workspace_id
    AND m.role = 'admin'::membership_role
    AND m.status = 'active'::membership_status
    AND au.auth_user_id IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 2. Renewal engine ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_subscription_renewals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_invoice_id uuid;
  v_new_end timestamptz;
  v_processed integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_plan_code text;
  v_cycle text;
BEGIN
  FOR r IN
    SELECT ws.*, sp.code AS plan_code
    FROM public.workspace_subscriptions ws
    JOIN public.subscription_plans sp ON sp.id = ws.plan_id
    WHERE ws.status = 'active'
      AND ws.auto_renew = true
      AND ws.current_period_end IS NOT NULL
      AND ws.current_period_end <= now()
      AND ws.legal_hold = false
    LIMIT 100
  LOOP
    BEGIN
      -- Recalc pricing first
      PERFORM public.recalculate_workspace_subscription(r.workspace_id);

      v_cycle := r.billing_cycle::text;
      v_new_end := CASE WHEN v_cycle = 'yearly'
                        THEN r.current_period_end + interval '1 year'
                        ELSE r.current_period_end + interval '1 month' END;

      -- Generate invoice for next cycle
      SELECT public.generate_platform_invoice(
        r.workspace_id, r.plan_code, v_cycle, 'business', NULL, NULL
      ) INTO v_invoice_id;

      -- Schedule first payment attempt
      INSERT INTO public.payment_attempts(workspace_id, invoice_id, attempt_number, scheduled_at, status)
      VALUES (r.workspace_id, v_invoice_id, 1, now(), 'scheduled');

      -- Advance period
      UPDATE public.workspace_subscriptions
         SET current_period_start = r.current_period_end,
             current_period_end   = v_new_end,
             updated_at = now()
       WHERE id = r.id;

      PERFORM public.log_subscription_event(
        r.workspace_id, 'renewal_generated', 'info',
        'Renovação automática gerada', jsonb_build_object('invoice_id', v_invoice_id, 'cycle', v_cycle)
      );

      PERFORM public.notify_workspace_admins(
        r.workspace_id, 'billing', 'Renovação gerada',
        'A próxima factura da assinatura foi emitida automaticamente.',
        'invoice', v_invoice_id
      );

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('workspace_id', r.workspace_id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('processed', v_processed, 'errors', v_errors, 'run_at', now());
END;
$$;

-- 3. Retry engine --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_payment_retries()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
  v_invoice record;
  v_processed integer := 0;
  v_next_delay interval;
BEGIN
  FOR a IN
    SELECT pa.*
    FROM public.payment_attempts pa
    WHERE pa.status = 'scheduled'
      AND pa.scheduled_at <= now()
    ORDER BY pa.scheduled_at
    LIMIT 200
  LOOP
    SELECT * INTO v_invoice FROM public.platform_invoices WHERE id = a.invoice_id;

    -- If invoice already paid, cancel attempt and skip
    IF v_invoice.status = 'paid' THEN
      UPDATE public.payment_attempts
         SET status='cancelled', attempted_at=now() WHERE id=a.id;
      CONTINUE;
    END IF;

    -- No real gateway: mark as failed, schedule next or escalate
    UPDATE public.payment_attempts
       SET status='failed', attempted_at=now(), failure_reason='no_gateway_simulation'
     WHERE id=a.id;

    PERFORM public.log_subscription_event(
      a.workspace_id, 'payment_retry_failed', 'warning',
      format('Tentativa de cobrança #%s falhou', a.attempt_number),
      jsonb_build_object('invoice_id', a.invoice_id, 'attempt', a.attempt_number)
    );

    IF a.attempt_number < 3 THEN
      v_next_delay := CASE a.attempt_number WHEN 1 THEN interval '3 days'
                                            WHEN 2 THEN interval '5 days'
                                            ELSE interval '7 days' END;
      INSERT INTO public.payment_attempts(workspace_id, invoice_id, attempt_number, scheduled_at, status)
      VALUES (a.workspace_id, a.invoice_id, a.attempt_number + 1, now() + v_next_delay, 'scheduled');

      PERFORM public.notify_workspace_admins(
        a.workspace_id, 'warning', 'Cobrança falhou',
        format('A cobrança automática falhou. Nova tentativa em %s.', v_next_delay::text),
        'invoice', a.invoice_id
      );
    ELSE
      -- All retries exhausted → grace period
      UPDATE public.workspace_subscriptions
         SET status='grace_period', grace_until = now() + interval '7 days', updated_at=now()
       WHERE workspace_id = a.workspace_id AND status IN ('active','past_due');

      PERFORM public.log_subscription_event(
        a.workspace_id, 'grace_period_entered', 'warning',
        'Workspace entrou em período de tolerância após esgotar tentativas de cobrança.',
        jsonb_build_object('invoice_id', a.invoice_id)
      );

      PERFORM public.notify_workspace_admins(
        a.workspace_id, 'warning', 'Período de tolerância iniciado',
        'O pagamento da assinatura falhou após várias tentativas. Tens 7 dias para regularizar.',
        'invoice', a.invoice_id
      );
    END IF;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', v_processed, 'run_at', now());
END;
$$;

-- 4. Lifecycle transitions ----------------------------------------------
CREATE OR REPLACE FUNCTION public.process_lifecycle_transitions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_unpaid_days integer;
  v_transitions integer := 0;
BEGIN
  -- grace_period → soft suspend after grace_until
  FOR r IN SELECT * FROM public.workspace_subscriptions
            WHERE status='grace_period' AND grace_until IS NOT NULL AND grace_until <= now()
            AND legal_hold = false
  LOOP
    UPDATE public.workspace_subscriptions
       SET status='suspended', suspension_mode='soft', updated_at=now()
     WHERE id=r.id;
    PERFORM public.log_subscription_event(r.workspace_id,'soft_suspension','error',
      'Workspace passou a suspensão suave (readonly).','{}'::jsonb);
    PERFORM public.notify_workspace_admins(r.workspace_id,'error','Workspace suspensa (modo leitura)',
      'A workspace foi suspensa por falta de pagamento. Acesso limitado a leitura.','subscription',r.id);
    v_transitions := v_transitions + 1;
  END LOOP;

  -- soft → hard after 14 more days
  FOR r IN SELECT * FROM public.workspace_subscriptions
            WHERE status='suspended' AND suspension_mode='soft'
              AND updated_at < now() - interval '14 days'
              AND legal_hold = false
  LOOP
    UPDATE public.workspace_subscriptions
       SET suspension_mode='hard', updated_at=now()
     WHERE id=r.id;
    PERFORM public.log_subscription_event(r.workspace_id,'hard_suspension','error',
      'Workspace passou a suspensão dura (apenas faturação).','{}'::jsonb);
    PERFORM public.notify_workspace_admins(r.workspace_id,'error','Suspensão total',
      'A workspace foi totalmente suspensa. Apenas a área de faturação continua acessível.','subscription',r.id);
    v_transitions := v_transitions + 1;
  END LOOP;

  -- hard → archived after 30 more days
  FOR r IN SELECT * FROM public.workspace_subscriptions
            WHERE status='suspended' AND suspension_mode='hard'
              AND updated_at < now() - interval '30 days'
              AND legal_hold = false
  LOOP
    UPDATE public.workspace_subscriptions
       SET status='cancelled', cancelled_at=now(), updated_at=now()
     WHERE id=r.id;
    PERFORM public.log_subscription_event(r.workspace_id,'archived','error',
      'Workspace arquivada por inatividade prolongada.','{}'::jsonb);
    v_transitions := v_transitions + 1;
  END LOOP;

  -- Restoration: any subscription with all invoices paid and not active → back to active
  FOR r IN
    SELECT ws.* FROM public.workspace_subscriptions ws
    WHERE ws.status IN ('grace_period','past_due','suspended')
      AND NOT EXISTS (
        SELECT 1 FROM public.platform_invoices pi
        WHERE pi.workspace_id = ws.workspace_id
          AND pi.status IN ('issued','overdue')
      )
      AND ws.legal_hold = false
  LOOP
    UPDATE public.workspace_subscriptions
       SET status='active', suspension_mode=NULL, grace_until=NULL, updated_at=now()
     WHERE id=r.id;
    PERFORM public.log_subscription_event(r.workspace_id,'restored','success',
      'Workspace restaurada — todas as facturas estão regularizadas.','{}'::jsonb);
    PERFORM public.notify_workspace_admins(r.workspace_id,'success','Acesso restaurado',
      'A workspace foi reactivada após regularização das facturas.','subscription',r.id);
    v_transitions := v_transitions + 1;
  END LOOP;

  RETURN jsonb_build_object('transitions', v_transitions, 'run_at', now());
END;
$$;

-- 5. Billing intelligence (per workspace) -------------------------------
CREATE OR REPLACE FUNCTION public.compute_billing_intelligence(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_tech_now integer;
  v_tech_30 integer;
  v_growth numeric;
  v_failed_recent integer;
  v_last_activity timestamptz;
  v_churn_risk text := 'low';
  v_downgrade text := 'low';
  v_inactive boolean := false;
  v_anomaly text := 'normal';
  v_days_inactive integer;
BEGIN
  SELECT * INTO v_sub FROM public.workspace_subscriptions WHERE workspace_id=_workspace_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','no_subscription'); END IF;

  SELECT count(*) INTO v_tech_now FROM public.memberships
   WHERE workspace_id=_workspace_id AND role='tecnico'::membership_role AND status='active'::membership_status;

  SELECT count(*) INTO v_tech_30 FROM public.memberships
   WHERE workspace_id=_workspace_id AND role='tecnico'::membership_role
     AND created_at < now() - interval '30 days';

  v_growth := CASE WHEN v_tech_30=0 THEN 0
                   ELSE round(((v_tech_now - v_tech_30)::numeric / v_tech_30) * 100, 1) END;

  SELECT count(*) INTO v_failed_recent FROM public.payment_attempts
   WHERE workspace_id=_workspace_id AND status='failed'
     AND attempted_at > now() - interval '60 days';

  SELECT max(created_at) INTO v_last_activity FROM public.backend_event_logs
   WHERE workspace_id=_workspace_id;
  v_days_inactive := COALESCE(EXTRACT(day FROM now() - v_last_activity)::int, 999);
  v_inactive := v_days_inactive > 14;

  -- Churn risk
  IF v_sub.status IN ('grace_period','suspended') OR v_failed_recent >= 2 OR v_days_inactive > 30 THEN
    v_churn_risk := 'high';
  ELSIF v_failed_recent = 1 OR v_days_inactive > 14 OR (v_growth < -20) THEN
    v_churn_risk := 'medium';
  END IF;

  -- Downgrade
  IF v_growth < -20 THEN v_downgrade := 'high';
  ELSIF v_growth < 0 THEN v_downgrade := 'medium';
  END IF;

  -- Anomaly
  IF v_growth > 100 AND v_tech_now > 5 THEN v_anomaly := 'spike';
  ELSIF v_growth < -50 THEN v_anomaly := 'drop';
  END IF;

  RETURN jsonb_build_object(
    'workspace_id', _workspace_id,
    'status', v_sub.status,
    'technician_count', v_tech_now,
    'technician_growth_pct', v_growth,
    'failed_payments_60d', v_failed_recent,
    'days_since_activity', v_days_inactive,
    'inactive', v_inactive,
    'churn_risk', v_churn_risk,
    'downgrade_probability', v_downgrade,
    'growth_anomaly', v_anomaly,
    'computed_at', now()
  );
END;
$$;

-- 6. Platform smart metrics ---------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_platform_smart_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mrr numeric := 0;
  v_arr numeric := 0;
  v_mrr_30 numeric := 0;
  v_mrr_growth numeric := 0;
  v_active integer := 0;
  v_trials integer := 0;
  v_cancelled_30 integer := 0;
  v_active_30 integer := 0;
  v_churn_rate numeric := 0;
  v_retention numeric := 0;
  v_projected numeric := 0;
BEGIN
  SELECT COALESCE(sum(CASE WHEN billing_cycle='yearly' THEN current_price/12 ELSE current_price END),0),
         count(*) FILTER (WHERE status='active'),
         count(*) FILTER (WHERE status='trial')
    INTO v_mrr, v_active, v_trials
    FROM public.workspace_subscriptions
   WHERE status IN ('active','trial');

  v_arr := round(v_mrr * 12, 2);

  -- MRR 30 days ago (approx from invoice history)
  SELECT COALESCE(sum(total)/NULLIF(count(DISTINCT workspace_id),0),0)
    INTO v_mrr_30
    FROM public.platform_invoices
   WHERE issue_date BETWEEN (now() - interval '60 days')::date AND (now() - interval '30 days')::date
     AND status='paid';

  v_mrr_growth := CASE WHEN v_mrr_30 > 0 THEN round(((v_mrr - v_mrr_30)/v_mrr_30)*100,1) ELSE 0 END;

  SELECT count(*) INTO v_cancelled_30 FROM public.workspace_subscriptions
   WHERE cancelled_at > now() - interval '30 days';
  SELECT count(*) INTO v_active_30 FROM public.workspace_subscriptions
   WHERE created_at < now() - interval '30 days';

  v_churn_rate := CASE WHEN v_active_30 > 0 THEN round((v_cancelled_30::numeric / v_active_30)*100,2) ELSE 0 END;
  v_retention := round(100 - v_churn_rate, 2);
  v_projected := round(v_mrr * 12 * (1 + (v_mrr_growth/100)), 2);

  RETURN jsonb_build_object(
    'mrr', round(v_mrr,2),
    'arr', v_arr,
    'mrr_growth_pct', v_mrr_growth,
    'active_subscriptions', v_active,
    'trial_subscriptions', v_trials,
    'churn_rate_pct', v_churn_rate,
    'retention_pct', v_retention,
    'projected_arr', v_projected,
    'computed_at', now()
  );
END;
$$;

-- 7. Master automation runner ------------------------------------------
CREATE OR REPLACE FUNCTION public.run_subscription_automation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_renewals jsonb;
  v_retries jsonb;
  v_transitions jsonb;
  v_dunning jsonb;
BEGIN
  v_renewals := public.process_subscription_renewals();
  v_retries := public.process_payment_retries();
  v_dunning := public.run_dunning_check();
  v_transitions := public.process_lifecycle_transitions();
  RETURN jsonb_build_object(
    'renewals', v_renewals,
    'retries', v_retries,
    'dunning', v_dunning,
    'transitions', v_transitions
  );
END;
$$;

-- 8. Permissions --------------------------------------------------------
REVOKE ALL ON FUNCTION public.process_subscription_renewals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_payment_retries() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_lifecycle_transitions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_subscription_automation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_subscription_automation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_billing_intelligence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_platform_smart_metrics() TO authenticated;
