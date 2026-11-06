-- Employee dashboard: own active assignment, status-only updates. Apply during
-- an explicitly authorised database release, never as part of a frontend build.
CREATE SCHEMA IF NOT EXISTS private;

DROP POLICY IF EXISTS appointments_select_employee_own ON public.appointments;
CREATE POLICY appointments_select_employee_own ON public.appointments
FOR SELECT TO authenticated USING (
  public.is_business_employee(public.current_profile_id(), business_id)
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = appointments.employee_id
      AND e.business_id = appointments.business_id
      AND e.profile_id = public.current_profile_id() AND e.is_active
  )
);

DROP POLICY IF EXISTS appointments_update_employee_own ON public.appointments;
CREATE POLICY appointments_update_employee_own ON public.appointments
FOR UPDATE TO authenticated USING (
  public.is_business_employee(public.current_profile_id(), business_id)
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = appointments.employee_id
      AND e.business_id = appointments.business_id
      AND e.profile_id = public.current_profile_id() AND e.is_active
  )
) WITH CHECK (
  public.is_business_employee(public.current_profile_id(), business_id)
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = appointments.employee_id
      AND e.business_id = appointments.business_id
      AND e.profile_id = public.current_profile_id() AND e.is_active
  )
);

CREATE OR REPLACE FUNCTION private.guard_employee_appointment_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  -- Trusted maintenance and the existing owner/admin workflow are preserved.
  IF current_user IN ('postgres', 'service_role')
     OR public.is_business_admin(public.current_profile_id(), OLD.business_id) THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_business_employee(public.current_profile_id(), OLD.business_id)
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
