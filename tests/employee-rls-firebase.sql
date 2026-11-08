-- A non-UUID Firebase subject must resolve through the existing profile map.
INSERT INTO public.firebase_profile_map (firebase_uid, profile_id)
VALUES ('firebase-test-employee-a', '11000000-0000-0000-0000-000000000001');
UPDATE public.employees SET is_active=true WHERE id='c1000000-0000-0000-0000-000000000001';
SET request.jwt.claims='{"iss":"https://securetoken.google.com/isolated-fixture","sub":"firebase-test-employee-a","role":"authenticated"}';
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*) FROM public.appointments)=4,'mapped Firebase employee sees only own appointments');
UPDATE public.appointments SET status='confirmed' WHERE id='e1000000-0000-0000-0000-000000000004';
SELECT public.test_assert((SELECT status='confirmed' FROM public.appointments WHERE id='e1000000-0000-0000-0000-000000000004'),'mapped Firebase employee can change own status');
RESET ROLE;
