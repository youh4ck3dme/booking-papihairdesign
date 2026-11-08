-- Employee dashboard: own active assignment, status-only updates. Apply during
-- an explicitly authorised database release, never as part of a frontend build.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '25s';
DO $$
BEGIN
  IF to_regclass('public.appointments') IS NULL
     OR to_regclass('public.employees') IS NULL
     OR to_regclass('public.businesses') IS NULL
     OR to_regprocedure('auth.uid()') IS NULL
     OR to_regprocedure('public.is_business_admin(uuid,uuid)') IS NULL
     OR to_regprocedure('public.is_business_employee(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Booking schema prerequisites are missing; inspect the target project before release';
  END IF;
END;
$$;
CREATE SCHEMA IF NOT EXISTS private;
-- Also close the known historical public-read policy when upgrading an older
-- deployment; do not depend on a frontend release proving prior migrations ran.
DROP POLICY IF EXISTS appointments_select_public ON public.appointments;

DROP POLICY IF EXISTS appointments_select_employee_own ON public.appointments;
CREATE POLICY appointments_select_employee_own ON public.appointments
FOR SELECT TO authenticated USING (
  public.is_business_employee(auth.uid(), business_id)
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = appointments.employee_id
      AND e.business_id = appointments.business_id
      AND e.profile_id = auth.uid() AND e.is_active
  )
);

DROP POLICY IF EXISTS appointments_update_employee_own ON public.appointments;
CREATE POLICY appointments_update_employee_own ON public.appointments
FOR UPDATE TO authenticated USING (
  public.is_business_employee(auth.uid(), business_id)
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = appointments.employee_id
      AND e.business_id = appointments.business_id
      AND e.profile_id = auth.uid() AND e.is_active
  )
) WITH CHECK (
  public.is_business_employee(auth.uid(), business_id)
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = appointments.employee_id
      AND e.business_id = appointments.business_id
      AND e.profile_id = auth.uid() AND e.is_active
  )
);

CREATE OR REPLACE FUNCTION private.guard_employee_appointment_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  -- Trusted maintenance and the existing owner/admin workflow are preserved.
  IF current_user IN ('postgres', 'service_role')
     OR public.is_business_admin(auth.uid(), OLD.business_id) THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_business_employee(auth.uid(), OLD.business_id)
     OR (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM
        (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'Employees may only change their appointment status' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled')) OR
    (OLD.status = 'confirmed' AND NEW.status IN ('completed', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'Appointment status transition is not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_employee_appointment_update() FROM PUBLIC;
CREATE TRIGGER employee_appointment_status_guard BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION private.guard_employee_appointment_update();

CREATE INDEX IF NOT EXISTS idx_appointments_employee_dashboard
ON public.appointments (business_id, employee_id, start_at, id);

-- Intentionally public availability, not public appointment records. The only
-- exposed data is a bounded set of occupied timestamp intervals. Anonymous users
-- must be able to avoid busy slots without reading names, IDs, notes or statuses.
CREATE OR REPLACE FUNCTION private.get_public_busy_intervals(
  _business_id uuid, _employee_id uuid, _start timestamptz, _end timestamptz
) RETURNS TABLE(start_at timestamptz, end_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  allowed_days integer;
BEGIN
  IF _start IS NULL OR _end IS NULL OR NOT isfinite(_start) OR NOT isfinite(_end)
     OR _end <= _start OR _end - _start > interval '48 hours'
     OR _start < now() - interval '36 hours' THEN
    RAISE EXCEPTION 'Invalid availability window' USING ERRCODE = '22023';
  END IF;
  SELECT b.max_days_ahead INTO allowed_days
  FROM public.businesses b JOIN public.employees e ON e.business_id = b.id
  WHERE b.id = _business_id AND e.id = _employee_id AND e.is_active;
  IF NOT FOUND THEN RETURN; END IF;
  IF extract(epoch FROM (_end - now())) / 86400.0 > greatest(coalesce(allowed_days, 60), 0)::numeric + 1 THEN
    RAISE EXCEPTION 'Availability window exceeds booking horizon' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT greatest(a.start_at, _start), least(a.end_at, _end)
    FROM public.appointments a
    WHERE a.business_id = _business_id AND a.employee_id = _employee_id
      AND a.status <> 'cancelled' AND a.start_at < _end AND a.end_at > _start
    ORDER BY a.start_at, a.end_at;
END;
$$;
REVOKE ALL ON FUNCTION private.get_public_busy_intervals(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_public_busy_intervals(uuid, uuid, timestamptz, timestamptz) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_public_busy_intervals(
  _business_id uuid, _employee_id uuid, _start timestamptz, _end timestamptz
) RETURNS TABLE(start_at timestamptz, end_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT busy.start_at, busy.end_at
  FROM private.get_public_busy_intervals(_business_id, _employee_id, _start, _end) AS busy;
$$;
REVOKE ALL ON FUNCTION public.get_public_busy_intervals(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_busy_intervals(uuid, uuid, timestamptz, timestamptz) TO anon, authenticated, service_role;
COMMIT;
