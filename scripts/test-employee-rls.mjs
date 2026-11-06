import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// No connection strings, hosted projects or exposed database ports are used.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = `papi-employee-rls-${process.pid}-${Date.now()}`;
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr ?? `docker exited ${result.status}`);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.stdout;
}
function sql(contents) {
  const result = docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X'], contents);
  process.stdout.write(result);
}
let created = false;
try {
  docker(['run', '--rm', '--detach', '--name', name, '--network', 'none',
    '--tmpfs', '/var/lib/postgresql/data', '-e', 'PGDATA=/var/lib/postgresql/data/pgdata',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:18-alpine']);
  created = true;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    // The image's temporary init server accepts Unix sockets before restarting.
    // TCP readiness proves the final server is running, avoiding that init race.
    const check = spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { timeout: 5_000, stdio: 'ignore' });
    if (check.status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('Isolated PostgreSQL did not become ready');
  console.log('Local PostgreSQL 18; network=none; no published ports. Supabase auth claim primitives are simulated; table schema and RLS are real repository SQL.');
  sql(readFileSync(path.join(root, 'tests/employee-rls-bootstrap.sql'), 'utf8'));
  const migrations = [
    '20260219160842_ac587df3-28ee-419c-b19e-a20eddc1098d.sql',
    '20260223120000_firebase_auth.sql',
    '20260223120100_firebase_rls_use_current_profile_id.sql',
    '20260226014039_3e8ba69c-7a53-49a8-85e6-e63ef96e5a5d.sql',
    ...readdirSync(path.join(root, 'supabase/migrations')).filter(file => /^\d+_employee_dashboard_status_guard\.sql$/.test(file)),
  ];
  if (migrations.length !== 5) throw new Error('Expected exactly one dashboard guard migration');
  for (const file of migrations) {
    if (file.endsWith('_employee_dashboard_status_guard.sql')) {
      // Reproduce an older production baseline with the known permissive policy.
      // The dashboard migration itself must remove it before anon isolation passes.
      sql('CREATE POLICY appointments_select_public ON public.appointments FOR SELECT USING (true);');
    }
    console.log(`Applying relevant table/auth/RLS migration: ${file}`);
    sql(readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
  }
  sql(readFileSync(path.join(root, 'tests/employee-rls.sql'), 'utf8'));
  sql(readFileSync(path.join(root, 'tests/public-availability.sql'), 'utf8'));
  console.log('PASS: isolated employee RLS and status transition suite');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (created) {
    const cleanup = spawnSync('docker', ['rm', '--force', name], { encoding: 'utf8', timeout: 30_000 });
    if (cleanup.status !== 0) { console.error(`Could not remove own test container ${name}`); process.exitCode = 1; }
  }
}
