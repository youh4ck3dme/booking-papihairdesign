-- Enforce the same half-open overlap rule as public availability for every writer.
-- Existing overlaps must be resolved before this migration can be applied.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_employee_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status <> 'cancelled');
COMMIT;
