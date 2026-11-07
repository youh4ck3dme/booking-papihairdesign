-- Continue after the competing service-role transactions have settled.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF (SELECT array_agg(id) FROM public.appointments WHERE start_at = '2099-01-01T10:00:00Z')
      IS DISTINCT FROM ARRAY['f1000000-0000-0000-0000-000000000001'::uuid] THEN
    RAISE EXCEPTION 'Expected exactly one committed appointment after contention';
  END IF;
END;
$$;

INSERT INTO public.appointments (id,business_id,customer_id,employee_id,service_id,start_at,end_at,status)
VALUES
 ('f1000000-0000-0000-0000-000000000003','a1b2c3d4-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001','2099-01-01T11:00:00Z','2099-01-01T12:00:00Z','confirmed'),
 ('f1000000-0000-0000-0000-000000000004','a1b2c3d4-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001','2099-01-01T10:00:00Z','2099-01-01T11:00:00Z','cancelled'),
 ('f1000000-0000-0000-0000-000000000005','a1b2c3d4-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002',
  'b1000000-0000-0000-0000-000000000001','2099-01-01T10:00:00Z','2099-01-01T11:00:00Z','confirmed');

DO $$
BEGIN
  BEGIN
    UPDATE public.appointments SET status='pending' WHERE id='f1000000-0000-0000-0000-000000000004';
    RAISE EXCEPTION 'Overlapping cancellation must not be reactivated';
  EXCEPTION WHEN exclusion_violation THEN
    RAISE NOTICE 'PASS: boundary, cancelled and other-employee slots allowed, conflicting reactivation rejected';
  END;
END;
$$;
ROLLBACK;
