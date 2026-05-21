CREATE OR REPLACE FUNCTION public.log_production_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  SELECT COALESCE(full_name, email, 'Sistema')
    INTO v_actor
    FROM public.profiles
    WHERE user_id = auth.uid() OR id = auth.uid()
    LIMIT 1;

  v_actor := COALESCE(v_actor, 'Sistema');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.production_events(
      production_order_id, workspace_id, actor_user_id, actor_name, event_type, to_value, payload
    )
    VALUES (
      NEW.id,
      NEW.workspace_id,
      COALESCE(auth.uid(), NEW.created_by),
      v_actor,
      'created',
      NEW.status::text,
      jsonb_build_object('code', NEW.code, 'priority', NEW.priority)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.production_events(production_order_id, workspace_id, actor_user_id, actor_name, event_type, from_value, to_value)
      VALUES (NEW.id, NEW.workspace_id, COALESCE(auth.uid(), NEW.created_by), v_actor, 'status_changed', OLD.status::text, NEW.status::text);
    END IF;

    IF NEW.technician_user_id IS DISTINCT FROM OLD.technician_user_id OR NEW.technician_name IS DISTINCT FROM OLD.technician_name THEN
      INSERT INTO public.production_events(production_order_id, workspace_id, actor_user_id, actor_name, event_type, from_value, to_value)
      VALUES (NEW.id, NEW.workspace_id, COALESCE(auth.uid(), NEW.created_by), v_actor, 'assigned', COALESCE(OLD.technician_name, OLD.technician_user_id::text), COALESCE(NEW.technician_name, NEW.technician_user_id::text));
    END IF;

    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      INSERT INTO public.production_events(production_order_id, workspace_id, actor_user_id, actor_name, event_type, from_value, to_value)
      VALUES (NEW.id, NEW.workspace_id, COALESCE(auth.uid(), NEW.created_by), v_actor, 'priority_changed', OLD.priority::text, NEW.priority::text);
    END IF;

    IF NEW.client_name IS DISTINCT FROM OLD.client_name THEN v_changes := v_changes || jsonb_build_object('client_name', jsonb_build_object('from', OLD.client_name, 'to', NEW.client_name)); END IF;
    IF NEW.platform IS DISTINCT FROM OLD.platform THEN v_changes := v_changes || jsonb_build_object('platform', jsonb_build_object('from', OLD.platform, 'to', NEW.platform)); END IF;
    IF NEW.insurer IS DISTINCT FROM OLD.insurer THEN v_changes := v_changes || jsonb_build_object('insurer', jsonb_build_object('from', OLD.insurer, 'to', NEW.insurer)); END IF;
    IF NEW.license_plate IS DISTINCT FROM OLD.license_plate THEN v_changes := v_changes || jsonb_build_object('license_plate', jsonb_build_object('from', OLD.license_plate, 'to', NEW.license_plate)); END IF;
    IF NEW.vin IS DISTINCT FROM OLD.vin THEN v_changes := v_changes || jsonb_build_object('vin', jsonb_build_object('from', OLD.vin, 'to', NEW.vin)); END IF;
    IF NEW.brand IS DISTINCT FROM OLD.brand THEN v_changes := v_changes || jsonb_build_object('brand', jsonb_build_object('from', OLD.brand, 'to', NEW.brand)); END IF;
    IF NEW.model IS DISTINCT FROM OLD.model THEN v_changes := v_changes || jsonb_build_object('model', jsonb_build_object('from', OLD.model, 'to', NEW.model)); END IF;
    IF NEW.color IS DISTINCT FROM OLD.color THEN v_changes := v_changes || jsonb_build_object('color', jsonb_build_object('from', OLD.color, 'to', NEW.color)); END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN v_changes := v_changes || jsonb_build_object('notes', true); END IF;
    IF NEW.due_at IS DISTINCT FROM OLD.due_at THEN v_changes := v_changes || jsonb_build_object('due_at', jsonb_build_object('from', OLD.due_at, 'to', NEW.due_at)); END IF;

    IF v_changes <> '{}'::jsonb THEN
      INSERT INTO public.production_events(production_order_id, workspace_id, actor_user_id, actor_name, event_type, payload)
      VALUES (NEW.id, NEW.workspace_id, COALESCE(auth.uid(), NEW.created_by), v_actor, 'field_updated', v_changes);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.log_production_photo_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
BEGIN
  SELECT COALESCE(full_name, email, 'Sistema')
    INTO v_actor
    FROM public.profiles
    WHERE user_id = auth.uid() OR id = auth.uid()
    LIMIT 1;

  INSERT INTO public.production_events(production_order_id, workspace_id, actor_user_id, actor_name, event_type, to_value, payload)
  VALUES (
    NEW.production_order_id,
    NEW.workspace_id,
    COALESCE(auth.uid(), NEW.uploaded_by),
    COALESCE(v_actor, 'Sistema'),
    'photo_added',
    NEW.category::text,
    jsonb_build_object('storage_path', NEW.storage_path, 'caption', NEW.caption)
  );
  RETURN NEW;
END $$;