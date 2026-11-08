-- Version the observed primary booking RPC. The preceding overlap exclusion
-- constraint protects this RPC and the legacy Edge writer from concurrent inserts.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_public_booking(business_id uuid, service_id uuid, employee_id uuid, start_at timestamp with time zone, customer_name text, customer_email text, customer_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_service record;
  v_employee record;
  v_customer_id uuid;
  v_end_at timestamptz;
  v_appointment_id uuid;
  v_conflict_count int;
  v_clean_email text;
  v_clean_name text;
  v_clean_phone text;
BEGIN
  -- 1. Input sanitization
  v_clean_email := lower(trim(customer_email));
  v_clean_name := trim(customer_name);
  v_clean_phone := nullif(trim(customer_phone), '');

  IF length(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'Meno musí mať aspoň 2 znaky';
  END IF;

  IF v_clean_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'Neplatná emailová adresa';
  END IF;

  -- 2. Fetch active service
  SELECT s.id, s.duration_minutes, coalesce(s.buffer_minutes, 0) as buffer_minutes, s.name_sk as name, s.price
  INTO v_service
  FROM public.services s
  WHERE s.id = create_public_booking.service_id
    AND s.business_id = create_public_booking.business_id
    AND s.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vybraná služba neexistuje alebo nie je aktívna';
  END IF;

  -- 3. Calculate end_at
  v_end_at := create_public_booking.start_at + ((v_service.duration_minutes + v_service.buffer_minutes) * interval '1 minute');

  -- 4. Check active employee
  SELECT e.id, e.display_name as name
  INTO v_employee
  FROM public.employees e
  WHERE e.id = create_public_booking.employee_id
    AND e.business_id = create_public_booking.business_id
    AND e.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vybraný špecialista neexistuje alebo nie je aktívny';
  END IF;

  -- 5. Overlap collision check
  SELECT count(*)
  INTO v_conflict_count
  FROM public.appointments a
  WHERE a.employee_id = create_public_booking.employee_id
    AND a.status IN ('pending', 'confirmed')
    AND a.start_at < v_end_at
    AND a.end_at > create_public_booking.start_at;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'Vybraný termín je už obsadený. Vyberte si prosím iný čas.';
  END IF;

  -- 6. Upsert customer record
  SELECT c.id INTO v_customer_id
  FROM public.customers c
  WHERE c.business_id = create_public_booking.business_id
    AND lower(c.email) = v_clean_email
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (business_id, full_name, email, phone)
    VALUES (create_public_booking.business_id, v_clean_name, v_clean_email, v_clean_phone)
    RETURNING id INTO v_customer_id;
  ELSE
    UPDATE customers
    SET full_name = v_clean_name,
        phone = coalesce(v_clean_phone, phone),
        updated_at = now()
    WHERE id = v_customer_id;
  END IF;

  -- 7. Insert appointment
  INSERT INTO public.appointments (
    business_id,
    customer_id,
    employee_id,
    service_id,
    start_at,
    end_at,
    status,
    notes
  )
  VALUES (
    create_public_booking.business_id,
    v_customer_id,
    create_public_booking.employee_id,
    create_public_booking.service_id,
    create_public_booking.start_at,
    v_end_at,
    'confirmed'::public.appointment_status,
    'Online rezervácia z webu'
  )
  RETURNING id INTO v_appointment_id;

  -- 8. Return success payload
  RETURN jsonb_build_object(
    'id', v_appointment_id,
    'business_id', create_public_booking.business_id,
    'customer_id', v_customer_id,
    'service_id', create_public_booking.service_id,
    'employee_id', create_public_booking.employee_id,
    'start_at', create_public_booking.start_at,
    'end_at', v_end_at,
    'status', 'confirmed',
    'service_name', v_service.name,
    'service_price', v_service.price,
    'employee_name', v_employee.name,
    'customer_name', v_clean_name,
    'customer_email', v_clean_email,
    'claim_token', 'claim-' || v_appointment_id::text
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_public_booking(uuid, uuid, uuid, timestamptz, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking(uuid, uuid, uuid, timestamptz, text, text, text) TO anon, authenticated, service_role;
COMMIT;
