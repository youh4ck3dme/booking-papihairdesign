import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dockerName = `papi-employee-rls-${process.pid}-${Date.now()}`;
const pgBin = process.env.PAPI_PG_BIN;
const pgEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
// macOS needs an explicit locale for a postmaster started by the clean sandbox.
if (pgBin) pgEnv.LC_ALL = 'C';
let dockerCreated = false;
let nativeDirectory;

function command(executable, args, input) {
  const result = spawnSync(executable, args, { input, encoding: 'utf8', env: pgEnv, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.error?.message ?? (result.stderr?.trim() || `${executable} exited ${result.status}`));
  if (result.stderr) process.stderr.write(result.stderr);
  return result.stdout;
}

async function startPostgres() {
  if (pgBin) {
    if (!path.isAbsolute(pgBin)) throw new Error('PAPI_PG_BIN must be an absolute PostgreSQL 18 bin directory');
    const version = command(path.join(pgBin, 'postgres'), ['--version']);
    if (!/^postgres \(PostgreSQL\) 18\./.test(version)) throw new Error('PAPI_PG_BIN must point to PostgreSQL 18');
    nativeDirectory = mkdtempSync(path.join(os.tmpdir(), 'papi-booking-sql-'));
    const data = path.join(nativeDirectory, 'data');
    command(path.join(pgBin, 'initdb'), ['-D', data, '--username=postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    appendFileSync(path.join(data, 'postgresql.conf'),
      `\nlisten_addresses = ''\nunix_socket_directories = '${nativeDirectory.replaceAll("'", "''")}'\nunix_socket_permissions = 0700\n`);
    const serverLog = path.join(nativeDirectory, 'postgres.log');
    try {
      command(path.join(pgBin, 'pg_ctl'), ['-D', data, '-l', serverLog, '-w', 'start']);
    } catch (error) {
      if (existsSync(serverLog)) process.stderr.write(readFileSync(serverLog, 'utf8'));
      throw error;
    }
    console.log('Local PostgreSQL 18; private Unix socket only. Supabase auth claim primitives are simulated.');
    return;
  }
  command('docker', ['run', '--rm', '--detach', '--name', dockerName, '--network', 'none',
    '--tmpfs', '/var/lib/postgresql/data', '-e', 'PGDATA=/var/lib/postgresql/data/pgdata',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:18-alpine']);
  dockerCreated = true;
  await waitUntil(() => spawnSync('docker', ['exec', dockerName, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], {
    timeout: 5_000, stdio: 'ignore', env: pgEnv,
  }).status === 0, 'Isolated PostgreSQL did not become ready');
  console.log('Local PostgreSQL 18; Docker network=none, no published ports. Supabase auth claim primitives are simulated.');
}

function psql(database) {
  const args = ['-qAtwX', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-U', 'postgres', '-d', database];
  return pgBin
    ? [path.join(pgBin, 'psql'), '-h', nativeDirectory, '-p', '5432', ...args]
    : ['docker', 'exec', '-i', dockerName, 'psql', ...args];
}

function sql(database, contents) {
  const [executable, ...args] = psql(database);
  return command(executable, args, contents).trim();
}

function file(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function migration(database, filename) {
  console.log(`${database}: applying ${filename}`);
  sql(database, file(`supabase/migrations/${filename}`));
}

const baseSchema = '20260219160842_ac587df3-28ee-419c-b19e-a20eddc1098d.sql';
const originalGuard = '20261106192120_employee_dashboard_status_guard.sql';
const compatibleGuard = '20261107170714_booking_dashboard_auth_compatibility.sql';
const overlapConstraint = '20261107170725_prevent_overlapping_appointments.sql';

function verifyAuth(database, profile) {
  sql('postgres', `CREATE DATABASE ${database};`);
  sql(database, file('tests/employee-rls-bootstrap.sql'));
  migration(database, baseSchema);
  if (profile === 'firebase') {
    migration(database, '20260223120000_firebase_auth.sql');
    migration(database, '20260223120100_firebase_rls_use_current_profile_id.sql');
  }
  migration(database, '20260226014039_3e8ba69c-7a53-49a8-85e6-e63ef96e5a5d.sql');
  // Reproduce the permissive historical policy that the dashboard must remove.
  sql(database, 'CREATE POLICY appointments_select_public ON public.appointments FOR SELECT USING (true);');
  if (profile === 'firebase') migration(database, originalGuard);
  if (profile === 'native-upgrade') {
    sql(database, file('tests/fixtures/20261107162646_employee_dashboard_auth_uid.sql'));
  }
  migration(database, compatibleGuard);
  if (profile === 'native-upgrade') migration(database, compatibleGuard);
  const guardCount = sql(database, `SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.appointments'::regclass AND tgname = 'employee_appointment_status_guard' AND NOT tgisinternal;`);
  if (guardCount !== '1') throw new Error(`${database}: expected one dashboard trigger`);

  // Roll back the artificial availability fixtures, which include pre-existing
  // overlapping rows to exercise clipping at the start and end of the window.
  sql(database, ['BEGIN;', file('tests/employee-rls.sql'), file('tests/public-availability.sql'),
    profile === 'firebase' ? file('tests/employee-rls-firebase.sql') : '', 'ROLLBACK;'].join('\n'));
  console.log(`PASS: ${database} employee RLS, status transitions and public availability`);
}

function startSession(database) {
  const [executable, ...args] = psql(database);
  const child = spawn(executable, args, { env: pgEnv, stdio: ['pipe', 'pipe', 'pipe'] });
  const session = { child, output: '', errors: '' };
  child.stdout.on('data', chunk => { session.output += chunk; });
  child.stderr.on('data', chunk => { session.errors += chunk; });
  child.stdin.on('error', error => { session.errors += error.message; });
  child.on('error', error => { session.errors += error.message; });
  session.exit = new Promise(resolve => child.once('close', resolve));
  return session;
}

async function waitUntil(check, failure) {
  for (let i = 0; i < 50; i++) {
    if (check()) return;
    await delay(200);
  }
  throw new Error(typeof failure === 'function' ? failure() : failure);
}

async function verifyConcurrentBooking(database) {
  migration(database, overlapConstraint);
  sql(database, 'GRANT SELECT, INSERT, UPDATE ON public.appointments TO service_role;');
  const appointment = id => `INSERT INTO public.appointments
    (id, business_id, customer_id, employee_id, service_id, start_at, end_at, status) VALUES
    ('f1000000-0000-0000-0000-00000000000${id}', 'a1b2c3d4-0000-0000-0000-000000000001',
     'd1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
     'b1000000-0000-0000-0000-000000000001', '2099-01-01T10:00:00Z', '2099-01-01T11:00:00Z', 'confirmed');`;
  const transaction = `BEGIN; SET LOCAL ROLE service_role; SET LOCAL statement_timeout = '20s';
    SET LOCAL idle_in_transaction_session_timeout = '20s';`;
  const first = startSession(database);
  let second;
  try {
    first.child.stdin.write(`${transaction}\n${appointment(1)}\nSELECT 'first-holds-slot';\n`);
    await waitUntil(() => first.output.includes('first-holds-slot'), () => `First booking did not insert: ${first.errors}`);
    second = startSession(database);
    second.child.stdin.end(`SET application_name = 'booking-overlap-contender';\n${transaction}\n${appointment(2)}\nCOMMIT;\n`);
    await waitUntil(() => sql(database, `SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity WHERE application_name = 'booking-overlap-contender'
      AND wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(pid)) > 0);`) === 't',
    () => `Second booking never waited for the first transaction: ${second.errors}`);
    first.child.stdin.end('COMMIT;\n');
    if (await first.exit !== 0) throw new Error(`First booking did not commit: ${first.errors}`);
    if (await second.exit === 0 || !second.errors.includes('23P01') ||
        !second.errors.includes('appointments_employee_no_overlap')) {
      throw new Error(`Second booking did not hit the overlap constraint: ${second.errors}`);
    }
  } finally {
    if (first.child.exitCode === null) first.child.kill();
    if (second?.child.exitCode === null) second.child.kill();
  }
  sql(database, file('tests/booking-overlap.sql'));
  console.log('PASS: two independent service-role transactions contested one slot and exactly one booking committed');
}

try {
  await startPostgres();
  verifyAuth('booking_firebase', 'firebase');
  verifyAuth('booking_native_clean', 'native');
  verifyAuth('booking_native_upgrade', 'native-upgrade');
  await verifyConcurrentBooking('booking_native_clean');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  try {
    if (dockerCreated) command('docker', ['rm', '--force', dockerName]);
    if (nativeDirectory) {
      const data = path.join(nativeDirectory, 'data');
      if (existsSync(path.join(data, 'postmaster.pid'))) {
        command(path.join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']);
      }
      rmSync(nativeDirectory, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(`Could not stop own test database: ${error.message}`);
    process.exitCode = 1;
  }
}
