BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.get_public_bookable_employees(
  _business_id uuid, _service_id uuid DEFAULT NULL
) RETURNS TABLE(id uuid, display_name text, photo_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT e.id, e.display_name, e.photo_url
  FROM public.employees e
  WHERE e.business_id = _business_id AND e.is_active
    AND public.is_employee_bookable_for_services(e.id, _business_id)
    AND (_service_id IS NULL OR EXISTS (
      SELECT 1 FROM public.employee_services es
      JOIN public.services s ON s.id = es.service_id
      WHERE es.employee_id = e.id AND s.id = _service_id
        AND s.business_id = _business_id AND s.is_active
    ))
  ORDER BY e.display_name, e.id;
$$;
REVOKE ALL ON FUNCTION private.get_public_bookable_employees(uuid, uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_public_bookable_employees(uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_bookable_employees(
  _business_id uuid, _service_id uuid DEFAULT NULL
) RETURNS TABLE(id uuid, display_name text, photo_url text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT e.id, e.display_name, e.photo_url
  FROM private.get_public_bookable_employees(_business_id, _service_id) e;
$$;
REVOKE ALL ON FUNCTION public.get_public_bookable_employees(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_bookable_employees(uuid, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
