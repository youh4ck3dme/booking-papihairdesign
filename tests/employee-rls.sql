-- Real SQL/RLS execution, synthetic local records, no outbound network.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
CREATE FUNCTION public.test_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END $$;
CREATE FUNCTION public.test_denied(statement text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL: % was allowed', label;
END $$;

INSERT INTO auth.users (id,email) VALUES
 ('11000000-0000-0000-0000-000000000001','employee-a@example.invalid'),
 ('11000000-0000-0000-0000-000000000002','employee-b@example.invalid'),
 ('11000000-0000-0000-0000-000000000003','owner@example.invalid'),
 ('11000000-0000-0000-0000-000000000004','unassigned@example.invalid'),
 ('11000000-0000-0000-0000-000000000005','customer@example.invalid'),
 ('11000000-0000-0000-0000-000000000006','other-business@example.invalid'),
 ('11000000-0000-0000-0000-000000000007','admin@example.invalid');
INSERT INTO public.businesses (id,name) VALUES ('a2000000-0000-0000-0000-000000000001','Other fixture salon');
INSERT INTO public.memberships (business_id,profile_id,role) VALUES
 ('a1b2c3d4-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','employee'),
 ('a1b2c3d4-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','employee'),
 ('a1b2c3d4-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000003','owner'),
 ('a1b2c3d4-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000004','employee'),
 ('a1b2c3d4-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000005','customer'),
 ('a2000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000006','employee'),
 ('a1b2c3d4-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000007','admin');
INSERT INTO public.services (id,business_id,name_sk,duration_minutes,price) VALUES ('b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','Other service',45,30);
INSERT INTO public.employees (id,business_id,profile_id,display_name) VALUES ('c2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000006','Other employee');
INSERT INTO public.customers (id,business_id,full_name,email) VALUES ('d2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','Other client','other-client@example.invalid');
INSERT INTO public.appointments (id,business_id,employee_id,customer_id,service_id,start_at,end_at) VALUES ('e2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','2026-11-07 09:00Z','2026-11-07 09:45Z');
UPDATE public.employees SET profile_id='11000000-0000-0000-0000-000000000001' WHERE id='c1000000-0000-0000-0000-000000000001';
UPDATE public.employees SET profile_id='11000000-0000-0000-0000-000000000002' WHERE id='c1000000-0000-0000-0000-000000000002';
INSERT INTO public.appointments (id,business_id,employee_id,customer_id,service_id,start_at,end_at,status)
SELECT ('e1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 'a1b2c3d4-0000-0000-0000-000000000001',
 CASE WHEN i=5 THEN 'c1000000-0000-0000-0000-000000000002'::uuid ELSE 'c1000000-0000-0000-0000-000000000001'::uuid END,
 'd1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001',
 '2026-11-07 09:00Z'::timestamptz + i*interval '1 hour', '2026-11-07 09:45Z'::timestamptz + i*interval '1 hour',
 CASE WHEN i=2 THEN 'confirmed'::public.appointment_status ELSE 'pending'::public.appointment_status END
FROM generate_series(1,5) i;

SET ROLE anon;
SELECT public.test_assert((SELECT count(*) FROM public.appointments)=0,'anon sees no private appointments');
RESET ROLE;
SET request.jwt.claims='{"iss":"local-test","sub":"11000000-0000-0000-0000-000000000001","role":"authenticated"}';
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*) FROM public.appointments)=4,'employee A sees only own four appointments');
WITH changed AS (UPDATE public.appointments SET status='confirmed' WHERE id='e1000000-0000-0000-0000-000000000005' RETURNING id)
SELECT public.test_assert((SELECT count(*) FROM changed)=0,'employee A cannot update employee B');
UPDATE public.appointments SET status='confirmed' WHERE id='e1000000-0000-0000-0000-000000000001' AND status='pending';
SELECT public.test_assert((SELECT status='confirmed' FROM public.appointments WHERE id='e1000000-0000-0000-0000-000000000001'),'pending can be confirmed');
WITH changed AS (UPDATE public.appointments SET status='cancelled' WHERE id='e1000000-0000-0000-0000-000000000001' AND status='pending' RETURNING id)
SELECT public.test_assert((SELECT count(*) FROM changed)=0,'stale expected status changes zero rows');
UPDATE public.appointments SET status='completed' WHERE id='e1000000-0000-0000-0000-000000000001';
SELECT public.test_assert((SELECT status='completed' FROM public.appointments WHERE id='e1000000-0000-0000-0000-000000000001'),'confirmed can be completed');
SELECT public.test_denied($q$UPDATE public.appointments SET status='pending' WHERE id='e1000000-0000-0000-0000-000000000001'$q$,'completed cannot be reopened');
UPDATE public.appointments SET status='cancelled' WHERE id IN ('e1000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000003');
SELECT public.test_assert((SELECT count(*) FROM public.appointments WHERE status='cancelled')=2,'pending and confirmed can be cancelled');
SELECT public.test_denied($q$UPDATE public.appointments SET status='confirmed' WHERE id='e1000000-0000-0000-0000-000000000003'$q$,'cancelled cannot be reopened');
SELECT public.test_denied($q$UPDATE public.appointments SET status='completed' WHERE id='e1000000-0000-0000-0000-000000000004'$q$,'pending cannot skip confirmation');
SELECT public.test_denied($q$UPDATE public.appointments SET notes='changed' WHERE id='e1000000-0000-0000-0000-000000000004'$q$,'employee cannot change other fields');
SELECT public.test_denied($q$UPDATE public.appointments SET start_at=start_at+interval '1 minute' WHERE id='e1000000-0000-0000-0000-000000000004'$q$,'employee cannot reschedule');
SELECT public.test_denied($q$UPDATE public.appointments SET employee_id='c1000000-0000-0000-0000-000000000002' WHERE id='e1000000-0000-0000-0000-000000000004'$q$,'employee cannot reassign');
RESET ROLE;

SET request.jwt.claims='{"iss":"local-test","sub":"11000000-0000-0000-0000-000000000002","role":"authenticated"}';
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*) FROM public.appointments)=1,'employee B sees only own appointment');
RESET ROLE;
SET request.jwt.claims='{"iss":"local-test","sub":"11000000-0000-0000-0000-000000000004","role":"authenticated"}';
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*) FROM public.appointments)=0,'unassigned employee has no fallback');
RESET ROLE;
SET request.jwt.claims='{"iss":"local-test","sub":"11000000-0000-0000-0000-000000000005","role":"authenticated"}';
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*) FROM public.appointments)=0,'unrelated customer sees no appointments');
RESET ROLE;
SET request.jwt.claims='{"iss":"local-test","sub":"11000000-0000-0000-0000-000000000006","role":"authenticated"}';
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*) FROM public.appointments)=1 AND (SELECT employee_id='c2000000-0000-0000-0000-000000000001' FROM public.appointments),'other business sees only its own appointment');
WITH changed AS (UPDATE public.appointments SET status='confirmed' WHERE id='e1000000-0000-0000-0000-000000000004' RETURNING id)
SELECT public.test_assert((SELECT count(*) FROM changed)=0,'cross-business update changes no rows');
RESET ROLE;
SET request.jwt.claims='{"iss":"local-test","sub":"11000000-0000-0000-0000-000000000003","role":"authenticated"}';
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*) FROM public.appointments)=5,'owner retains all business appointments');
UPDATE public.appointments SET notes='owner edit', status='pending' WHERE id='e1000000-0000-0000-0000-000000000001';
SELECT public.test_assert((SELECT notes='owner edit' FROM public.appointments WHERE id='e1000000-0000-0000-0000-000000000001'),'owner editing retained');
RESET ROLE;
SET request.jwt.claims='{"iss":"local-test","sub":"11000000-0000-0000-0000-000000000007","role":"authenticated"}';
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*) FROM public.appointments)=5,'administrator retains own business access');
UPDATE public.appointments SET notes='administrator edit' WHERE id='e1000000-0000-0000-0000-000000000004';
SELECT public.test_assert((SELECT notes='administrator edit' FROM public.appointments WHERE id='e1000000-0000-0000-0000-000000000004'),'administrator editing retained');
RESET ROLE;
UPDATE public.employees SET is_active=false WHERE id='c1000000-0000-0000-0000-000000000001';
SET request.jwt.claims='{"iss":"local-test","sub":"11000000-0000-0000-0000-000000000001","role":"authenticated"}';
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*) FROM public.appointments)=0,'inactive employee cannot access appointments');
RESET ROLE;
SET ROLE service_role;
UPDATE public.appointments SET notes='trusted maintenance' WHERE id='e1000000-0000-0000-0000-000000000004';
SELECT public.test_assert((SELECT notes='trusted maintenance' FROM public.appointments WHERE id='e1000000-0000-0000-0000-000000000004'),'service role maintenance retained');
RESET ROLE;
