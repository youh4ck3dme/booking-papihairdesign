-- Public availability has an intentionally narrower shape than private appointments.
-- All values/records are synthetic and scoped to this network-isolated test DB.
CREATE TEMP TABLE public_availability_window AS
SELECT date_trunc('day', now()) + interval '1 day' AS day_start;
GRANT SELECT ON public_availability_window TO anon, authenticated;
INSERT INTO public.businesses (id,name,max_days_ahead) VALUES ('a3000000-0000-0000-0000-000000000001','Public availability fixture',3);
INSERT INTO public.employees (id,business_id,display_name,is_active) VALUES
 ('c3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','Public active fixture',true),
 ('c3000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000001','Public inactive fixture',false);
INSERT INTO public.services (id,business_id,name_sk,duration_minutes) VALUES ('b3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','Public fixture service',45);
INSERT INTO public.customers (id,business_id,full_name,email) VALUES ('d3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','PRIVATE NAME MUST NOT BE PUBLIC','private@example.invalid');
INSERT INTO public.appointments (id,business_id,employee_id,customer_id,service_id,start_at,end_at,status,notes)
SELECT ('e3000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 'a3000000-0000-0000-0000-000000000001',
 CASE WHEN i=7 THEN 'c3000000-0000-0000-0000-000000000002'::uuid ELSE 'c3000000-0000-0000-0000-000000000001'::uuid END,
 'd3000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001',
 day_start + CASE i WHEN 1 THEN interval '9h' WHEN 2 THEN interval '11h' WHEN 3 THEN interval '-1h' WHEN 4 THEN interval '23h' WHEN 5 THEN interval '-1h' WHEN 6 THEN interval '24h' ELSE interval '12h' END,
 day_start + CASE i WHEN 1 THEN interval '10h' WHEN 2 THEN interval '12h' WHEN 3 THEN interval '1h' WHEN 4 THEN interval '25h' WHEN 5 THEN interval '0h' WHEN 6 THEN interval '25h' ELSE interval '13h' END,
 CASE WHEN i=2 THEN 'cancelled'::public.appointment_status ELSE 'confirmed'::public.appointment_status END,
 'PRIVATE NOTE MUST NOT BE PUBLIC'
FROM public_availability_window CROSS JOIN generate_series(1,7) i;

CREATE FUNCTION public.test_invalid_availability(_start timestamptz, _end timestamptz, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM * FROM public.get_public_busy_intervals('a3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001',_start,_end);
  EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'PASS: %', label; RETURN;
  END;
  RAISE EXCEPTION 'FAIL: % was allowed', label;
END $$;

SET request.jwt.claims='{}';
SET ROLE anon;
SELECT public.test_assert((SELECT count(*) FROM public.appointments)=0,'public booking cannot read appointment records directly');
SELECT public.test_assert((SELECT count(*) FROM public_availability_window w CROSS JOIN LATERAL public.get_public_busy_intervals('a3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001',w.day_start,w.day_start+interval '1 day'))=3,'public RPC excludes cancelled and adjacent non-overlapping intervals');
SELECT public.test_assert((SELECT bool_and(start_at>=w.day_start AND end_at<=w.day_start+interval '1 day') FROM public_availability_window w CROSS JOIN LATERAL public.get_public_busy_intervals('a3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001',w.day_start,w.day_start+interval '1 day')),'public RPC clips overlapping intervals to requested window');
SELECT public.test_assert((SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys((SELECT to_jsonb(busy) FROM public_availability_window w CROSS JOIN LATERAL public.get_public_busy_intervals('a3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001',w.day_start,w.day_start+interval '1 day') busy LIMIT 1)) key)=ARRAY['end_at','start_at'],'public RPC returns only timestamps, not client IDs/names/notes/status');
SELECT public.test_assert((SELECT count(*) FROM public_availability_window w CROSS JOIN LATERAL public.get_public_busy_intervals('a2000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001',w.day_start,w.day_start+interval '1 day'))=0,'employee belonging to another business has no public intervals');
SELECT public.test_assert((SELECT count(*) FROM public_availability_window w CROSS JOIN LATERAL public.get_public_busy_intervals('a3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000002',w.day_start,w.day_start+interval '1 day'))=0,'inactive employee has no public intervals');
SELECT public.test_invalid_availability(now(),now(),'empty public range denied');
SELECT public.test_invalid_availability(now(),now()-interval '1 hour','reversed public range denied');
SELECT public.test_invalid_availability(now(),now()+interval '49 hours','public range exceeding48hours denied');
SELECT public.test_invalid_availability(now()-interval '37 hours',now(),'historical public enumeration denied');
SELECT public.test_invalid_availability(now()+interval '5 days',now()+interval '6 days','public range beyond configured horizon denied');
SELECT public.test_invalid_availability(NULL,now(),'null public range denied');
SELECT public.test_invalid_availability(now(),'infinity'::timestamptz,'infinite public range denied');
RESET ROLE;
SET request.jwt.claims='{"iss":"local-test","sub":"11000000-0000-0000-0000-000000000001","role":"authenticated"}';
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*) FROM public_availability_window w CROSS JOIN LATERAL public.get_public_busy_intervals('a3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001',w.day_start,w.day_start+interval '1 day'))=3,'signed-in public booking also receives timestamp-only availability');
RESET ROLE;
