
-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text,
  is_read boolean NOT NULL DEFAULT false,
  entity_type text,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "full_access_authenticated"
  ON public.notifications
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Index for fast queries
CREATE INDEX idx_notifications_user_read ON public.notifications (user_id, is_read, created_at DESC);

-- Trigger function: create notification for all users on key events
CREATE OR REPLACE FUNCTION public.notify_on_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_message text;
  v_type text;
  v_entity_type text;
  v_entity_id uuid;
  v_user record;
BEGIN
  v_entity_id := NEW.id;

  IF TG_TABLE_NAME = 'service_orders' AND TG_OP = 'INSERT' THEN
    v_type := 'service_order';
    v_entity_type := 'service_order';
    v_title := 'Nouvel ordre de service';
    v_message := COALESCE(NEW.car_name, '') || ' ' || COALESCE(NEW.license_plate, '');
  ELSIF TG_TABLE_NAME = 'payment_orders' AND TG_OP = 'INSERT' THEN
    v_type := 'payment';
    v_entity_type := 'payment_order';
    v_title := 'Paiement reçu';
    v_message := COALESCE(NEW.car_name, '') || ' ' || COALESCE(NEW.license_plate, '');
  ELSIF TG_TABLE_NAME = 'discrepancies' AND TG_OP = 'INSERT' THEN
    v_type := 'discrepancy';
    v_entity_type := 'discrepancy';
    v_title := 'Écart détecté';
    v_message := NEW.issue_type || ': ' || COALESCE(NEW.expected_value::text, '?') || ' → ' || COALESCE(NEW.received_value::text, '?');
  ELSE
    RETURN NEW;
  END IF;

  -- Notify all admin users
  FOR v_user IN
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (v_user.user_id, v_type, v_title, v_message, v_entity_type, v_entity_id);
  END LOOP;

  -- Also notify the creator if different
  IF NEW.created_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.created_by AND role = 'admin'
  ) THEN
    INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (NEW.created_by, v_type, v_title, v_message, v_entity_type, v_entity_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Attach triggers
CREATE TRIGGER trg_notify_service_order
  AFTER INSERT ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_event();

CREATE TRIGGER trg_notify_payment_order
  AFTER INSERT ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_event();

CREATE TRIGGER trg_notify_discrepancy
  AFTER INSERT ON public.discrepancies
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_event();
