# Booking database release

## Dashboard migration

`20261107170714_booking_dashboard_auth_compatibility.sql` selects the Firebase-aware `public.current_profile_id()` when present and uses `auth.uid()` on a native Supabase schema. It reinstates the same timestamp-only public availability contract, removes the old anonymous appointment policy, and replaces the dashboard update trigger inside one transaction. The tracked Firebase migration `20261106192120` stays in its original history. On an existing native-auth project, the compatible file is the dashboard entry point because `20261106192120` requires Firebase.

The previous native-auth dashboard SQL is preserved under `tests/fixtures/20261107162646_employee_dashboard_auth_uid.sql` as the exact schema-change baseline. The fixture is used only in the local upgrade test. Compare the target's migration ledger and database definitions before a separately approved release. If earlier SQL was applied outside the migration ledger, reconcile it after confirming the definitions and their history. The local suite does not establish ledger equivalence with a hosted project.

## Appointment overlaps

`20261107170725_prevent_overlapping_appointments.sql` adds a GiST exclusion constraint for an employee's non-cancelled appointments. It uses half-open time ranges so adjacent appointments are allowed. PostgreSQL enforces the constraint for Edge Function, RPC, and admin writes that target this table. The repository's Edge fallback returns HTTP 409 when PostgreSQL rejects an overlapping insert with SQLSTATE `23P01`.

On the approved target, check for overlaps with this read-only query before planning the migration window. The result is a count and contains no customer data.

```sql
SELECT count(*) AS overlapping_pairs
FROM public.appointments a
JOIN public.appointments b
  ON a.employee_id = b.employee_id AND a.id < b.id
  AND a.start_at < b.end_at AND b.start_at < a.end_at
WHERE a.status <> 'cancelled' AND b.status <> 'cancelled';
```

The count must be zero. Schedule the constraint build with a database operator because it takes a table lock and validates existing rows. If existing data conflicts, the migration fails and rolls back. Resolve the records with the operator before retrying.

## Primary public booking RPC

`20261108120000_create_public_booking.sql` versions the observed production signature, input normalization, time calculation, and response fields. Apply it after the overlap constraint. The migration qualifies the tables and grants execution to the Supabase API roles explicitly. The Booking client uses the Edge fallback only for PostgREST `PGRST202`.

On the inspected production database, the function was present and callable by the anonymous and authenticated roles. The overlap exclusion constraint and the Supabase migration ledger were absent at inspection. Reconcile the target history and confirm the overlap count before applying the release changes.

## Verification

Run `pnpm run test:rls` for database checks or `pnpm run test:sandbox` for the full release gate. Docker is the default. With a local PostgreSQL 18 installation, set `PAPI_PG_BIN` to its absolute `bin` directory. This starts a disposable cluster with a private Unix socket and TCP disabled. Both modes run the same fixtures and SQL checks without a hosted URL or production data.

The database suite exercises the tracked Firebase migration path, a clean native-auth schema, and an upgrade from the previously applied native variant. It checks reapplication and authorization. Separate concurrency tests contest one slot with service-role writes and anonymous primary RPC calls. Exactly one transaction must commit in each test. The primary RPC tests also verify its response and that retrying an occupied slot leaves one row.
