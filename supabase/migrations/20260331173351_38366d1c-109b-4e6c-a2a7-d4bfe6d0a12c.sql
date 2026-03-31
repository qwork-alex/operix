CREATE OR REPLACE FUNCTION public.notify_on_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
  v_message text;
  v_type text;
  v_entity_type text;
  v_entity_id uuid;
  v_user record;
  v_actor_user_id uuid;
BEGIN
  v_entity_id := NEW.id;
  v_actor_user_id := NULLIF(to_jsonb(NEW)->>'created_by', '')::uuid;

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

  FOR v_user IN
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (v_user.user_id, v_type, v_title, v_message, v_entity_type, v_entity_id);
  END LOOP;

  IF v_actor_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_actor_user_id AND role = 'admin'
  ) THEN
    INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (v_actor_user_id, v_type, v_title, v_message, v_entity_type, v_entity_id);
  END IF;

  RETURN NEW;
END;
$function$;