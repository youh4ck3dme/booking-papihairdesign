-- Fix 1: Drop overly permissive public SELECT on appointments
DROP POLICY IF EXISTS "appointments_select_public" ON public.appointments;

-- Fix 2: Create RPC to return smtp config without password
CREATE OR REPLACE FUNCTION public.get_smtp_config_safe(_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT is_business_admin(auth.uid(), _business_id) THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'host', smtp_config->>'host',
      'port', smtp_config->>'port',
      'user', smtp_config->>'user',
      'from', smtp_config->>'from',
      'has_password', (smtp_config->>'pass' IS NOT NULL AND smtp_config->>'pass' != '')
    )
    FROM businesses
    WHERE id = _business_id
  );
END;
$$;