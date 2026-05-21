
ALTER FUNCTION public.touch_automation_rule() SET search_path = public;
ALTER FUNCTION public.touch_automation_queue() SET search_path = public;
ALTER VIEW public.v_automation_engine_stats SET (security_invoker = true);
