import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shaArg = process.argv[2] ?? 'HEAD';
const output = await mkdtemp(path.join(process.env.PAPI_SANDBOX_ROOT ?? os.tmpdir(), 'papi-employee-sandbox-'));
const workspace = path.join(output, 'workspace');
await mkdir(workspace);
const logs = path.join(output, 'logs');
await mkdir(logs);
// Deliberately do not inherit application credentials, .env files or CI retry settings.
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SYSTEMROOT', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'PLAYWRIGHT_BROWSERS_PATH', 'PLAYWRIGHT_CHROME_BIN', 'PAPI_PG_BIN']
  .filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { TZ: 'UTC', VITE_SUPABASE_URL: 'https://booking-fixture.invalid', VITE_SUPABASE_PROJECT_ID: 'booking-fixture', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_fixture_only' });
const pnpm = process.env.PAPI_PNPM_CLI ? [process.execPath, process.env.PAPI_PNPM_CLI] : ['pnpm'];
const result = { commit: null, node: process.version, pnpm: null, workspace, logs, checks: [], success: false, productionChanged: false, actionsRun: false };
let server;
function run(name, command, args, cwd = workspace) {
  console.log(`Running ${name}; log: ${path.join(logs, name + '.log')}`);
  return new Promise((resolve, reject) => {
    const log = createWriteStream(path.join(logs, name + '.log'));
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', data => { log.write(data); stdout += data; });
    child.stderr.pipe(log, { end: false });
    child.on('error', error => { log.end(String(error)); reject(error); });
    child.on('close', code => {
      log.end();
      result.checks.push({ name, exitCode: code });
      if (code !== 0) reject(new Error(`${name} failed (${code}); see ${path.join(logs, name + '.log')}`));
      else resolve(stdout.trim());
    });
  });
}
const pm = (name, args) => run(name, pnpm[0], [...pnpm.slice(1), ...args]);
try {
  if (![22, 24].includes(Number(process.versions.node.split('.')[0]))) throw new Error('Use supported Node 22 or 24');
  result.commit = await run('commit', 'git', ['rev-parse', '--verify', `${shaArg}^{commit}`], source);
  if (!/^[a-f0-9]{40}$/.test(result.commit)) throw new Error('Invalid commit');
  const archive = path.join(output, 'source.tar');
  await run('archive', 'git', ['archive', '--format=tar', `--output=${archive}`, result.commit], source);
  await run('extract', 'tar', ['-xf', archive, '-C', workspace]);
  const expectedRunner = await readFile(path.join(workspace, 'scripts/verify-sandbox.mjs'));
  if (!(await readFile(fileURLToPath(import.meta.url))).equals(expectedRunner)) throw new Error('Runner differs from the requested commit; use the committed runner');
  result.pnpm = await pm('pnpm-version', ['--version']);
  if (result.pnpm !== '10.11.0') throw new Error('Booking requires pnpm 10.11.0');
  const lockBefore = createHash('sha256').update(await readFile(path.join(workspace, 'pnpm-lock.yaml'))).digest('hex');
  await pm('install', ['install', '--frozen-lockfile', '--ignore-scripts']);
  await pm('types-app', ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.app.json']);
  await pm('types-node', ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.node.json']);
  await pm('lint', ['run', 'lint']);
  await pm('unit', ['test']);
  await pm('build', ['run', 'build']);
  await pm('audit-production', ['audit', '--prod', '--registry=https://registry.npmjs.org']);
  await pm('audit-full', ['audit', '--registry=https://registry.npmjs.org']);
  await run('rls', process.execPath, ['scripts/test-employee-rls.mjs']);
  const port = await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); });
  });
  const baseURL = `http://127.0.0.1:${port}`;
  env.PLAYWRIGHT_BASE_URL = baseURL;
  env.PAPI_E2E_SCREENSHOTS = path.join(output, 'screenshots');
  await mkdir(env.PAPI_E2E_SCREENSHOTS);
  const previewLog = createWriteStream(path.join(logs, 'preview.log'));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.pipe(previewLog); server.stderr.pipe(previewLog);
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('Preview exited before readiness');
    try { if ((await fetch(baseURL)).ok) { ready = true; break; } } catch { /* Await own preview startup. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Preview did not become ready');
  await pm('e2e', ['exec', 'playwright', 'test', '--config=e2e/playwright.config.ts', 'booking-light.spec.ts', 'employee-dashboard.spec.ts', 'employee-worker.spec.ts', '--workers=2', '--retries=0']);
  const lockAfter = createHash('sha256').update(await readFile(path.join(workspace, 'pnpm-lock.yaml'))).digest('hex');
  if (lockBefore !== lockAfter) throw new Error('Frozen install changed lockfile');
  result.lockfileUnchanged = true;
  result.success = true;
} catch (error) {
  result.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => { server.once('exit', resolve); setTimeout(() => { if (server.exitCode === null) server.kill('SIGKILL'); resolve(); }, 5_000).unref(); });
  }
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(`Sandbox result: ${path.join(output, 'result.json')}`);
}
