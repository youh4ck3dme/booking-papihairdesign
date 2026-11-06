import type { BrowserContext, Page, Request } from '@playwright/test';

export const STAFF_A = '10000000-0000-4000-8000-000000000001';
export const STAFF_B = '10000000-0000-4000-8000-000000000002';
export const BUSINESS_A = '20000000-0000-4000-8000-000000000001';
export const BUSINESS_B = '20000000-0000-4000-8000-000000000002';
export const EMPLOYEE_A = '30000000-0000-4000-8000-000000000001';
export const EMPLOYEE_B = '30000000-0000-4000-8000-000000000002';
export const FIXED_NOW = '2026-11-06T09:00:00Z';
export type FixtureRole = 'employee' | 'owner' | 'admin' | 'customer';
type Status = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export interface FixtureAppointment {
  id: string; business_id: string; employee_id: string;
  start_at: string; end_at: string; status: Status;
  customers: { full_name: string; phone: string; email: string };
  services: { name_sk: string; price: number };
  employees: { display_name: string };
}
export function appointment(id: string, name: string, status: Status, start: string, employee = EMPLOYEE_A, business = BUSINESS_A): FixtureAppointment {
  return {
    id, business_id: business, employee_id: employee, status, start_at: start,
    end_at: new Date(new Date(start).getTime() + 45 * 60000).toISOString(),
    customers: { full_name: name, phone: '+421900000000', email: 'fixture@example.invalid' },
    services: { name_sk: 'Dámsky strih', price: 30 },
    employees: { display_name: employee === EMPLOYEE_A ? 'Stylist A' : 'Stylist B' },
  };
}
export function defaultAppointments() {
  return [
    appointment('40000000-0000-4000-8000-000000000001', 'Anna Pending', 'pending', '2026-11-06T10:00:00Z'),
    appointment('40000000-0000-4000-8000-000000000002', 'Eva Confirmed', 'confirmed', '2026-11-06T11:00:00Z'),
    appointment('40000000-0000-4000-8000-000000000003', 'Mária Completed', 'completed', '2026-11-06T07:00:00Z'),
    appointment('40000000-0000-4000-8000-000000000004', 'Zora Cancelled', 'cancelled', '2026-11-06T08:00:00Z'),
    appointment('40000000-0000-4000-8000-000000000005', 'COLLEAGUE PRIVATE', 'confirmed', '2026-11-06T12:00:00Z', EMPLOYEE_B),
    appointment('40000000-0000-4000-8000-000000000006', 'OTHER BUSINESS PRIVATE', 'confirmed', '2026-11-06T13:00:00Z', EMPLOYEE_B, BUSINESS_B),
  ];
}
export function fixtureSession(userId = STAFF_A, expiresAt = Math.floor(Date.now() / 1000) + 24 * 3600) {
  const payload = { aud: 'authenticated', role: 'authenticated', sub: userId, email: 'staff@example.invalid', exp: expiresAt, iat: expiresAt - 24 * 3600, iss: 'https://booking-fixture.invalid/auth/v1' };
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture-signature`;
  return { access_token: token, refresh_token: 'fixture-refresh-token', token_type: 'bearer', expires_in: 24 * 3600, expires_at: expiresAt, user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'staff@example.invalid', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' } };
}
function subject(request: Request): string {
  try { return JSON.parse(Buffer.from((request.headers()['authorization'] ?? '').split('.')[1], 'base64url').toString()).sub ?? STAFF_A; } catch { return STAFF_A; }
}
function matches(row: Record<string, unknown>, key: string, expression: string): boolean {
  if (['select', 'order', 'limit', 'offset', 'or'].includes(key) || key.startsWith('csearch.') || key.startsWith('ssearch.')) return true;
  const value = key.split('.').reduce<unknown>((current, part) => current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined, row);
  const index = expression.indexOf('.');
  const operator = expression.slice(0, index); const operand = expression.slice(index + 1);
  if (operator === 'eq') return String(value) === operand;
  if (operator === 'neq') return String(value) !== operand;
  if (operator === 'gte') return String(value) >= operand;
  if (operator === 'gt') return String(value) > operand;
  if (operator === 'lt') return String(value) < operand;
  if (operator === 'lte') return String(value) <= operand;
  if (operator === 'in') return operand.replace(/^\(|\)$/g, '').split(',').includes(String(value));
  if (operator === 'ilike') return String(value).toLocaleLowerCase().includes(operand.replaceAll('*', '').replaceAll('%', '').toLocaleLowerCase());
  return true;
}
export interface EmployeeFixture {
  rows: FixtureAppointment[]; role: FixtureRole; missingEmployee: boolean;
  error: boolean; offline: boolean; conflictNextWrite: boolean;
  delayNextRead: Promise<void> | null; delayNextWrite?: Promise<void>; onPrivateRequest?: () => Promise<void>;
  queries: URL[]; writes: { url: URL; body: Record<string, unknown> }[]; blocked: string[];
}
export async function installEmployeeFixture(context: BrowserContext, options: { role?: FixtureRole; userId?: string; missingEmployee?: boolean; ambiguousEmployee?: boolean; missingMembership?: boolean; rows?: FixtureAppointment[]; signedIn?: boolean; expired?: boolean } = {}) {
  const state: EmployeeFixture = { rows: options.rows ?? defaultAppointments(), role: options.role ?? 'employee', missingEmployee: options.missingEmployee ?? false, error: false, offline: false, conflictNextWrite: false, delayNextRead: null, queries: [], writes: [], blocked: [] };
  const userId = options.userId ?? STAFF_A;
  const session = fixtureSession(userId, options.expired ? 1 : undefined);
  await context.addInitScript(({ session, signedIn }) => {
    if (!sessionStorage.getItem('employee-fixture-seeded')) {
      if (signedIn) {
        localStorage.setItem('sb-booking-fixture-auth-token', JSON.stringify(session));
      }
      localStorage.setItem('cookie_prefs_v1', JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }));
      localStorage.setItem('papi_lang', 'sk');
      sessionStorage.setItem('employee-fixture-seeded', 'true');
    }
  }, { session, signedIn: options.signedIn !== false });
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname.startsWith('/_vercel/')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
    const isApi = url.hostname === 'booking-fixture.invalid';
    if (!isApi) {
      if (url.pathname.includes('speed-insights') || url.hostname.endsWith('vercel-insights.com')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      state.blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort();
    }
    if (state.offline) return route.abort('internetdisconnected');
    const currentUser = subject(request);
    if (url.pathname.startsWith('/auth/v1/')) {
      if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
      if (options.expired) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'refresh_token_not_found', message: 'Fixture expired session' }) });
      if (url.pathname.endsWith('/token')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixtureSession(userId)) });
      if (url.pathname.endsWith('/user')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixtureSession(currentUser).user) });
      state.blocked.push(`${request.method()} ${url.pathname}`); return route.fulfill({ status: 405, body: '{}' });
    }
    const table = url.pathname.split('/').pop() ?? '';
    if (['profiles', 'memberships', 'employees', 'appointments'].includes(table)) await state.onPrivateRequest?.();
    if (request.method() === 'PATCH' && table === 'appointments') {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.writes.push({ url, body });
      const delay = state.delayNextWrite; state.delayNextWrite = undefined; if (delay) await delay;
      if (Object.keys(body).join(',') !== 'status') return route.fulfill({ status: 403, body: '{}' });
      const row = state.rows.find(row => [...url.searchParams].every(([key, value]) => matches(row as unknown as Record<string, unknown>, key, value)));
      if (state.conflictNextWrite) { state.conflictNextWrite = false; return route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', details: 'The result contains 0 rows', message: 'Cannot coerce the result to a single JSON object', hint: null }) }); }
      if (row) row.status = body.status as Status;
      const isObject = request.headers()['accept']?.includes('application/vnd.pgrst.object+json');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(isObject ? row ?? null : row ? [row] : []) });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      state.blocked.push(`${request.method()} ${url.pathname}`); return route.fulfill({ status: 405, body: '{}' });
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    const profiles = [STAFF_A, STAFF_B].map(id => ({ id, full_name: id === STAFF_A ? 'Stylist A' : 'Stylist B', email: 'staff@example.invalid', phone: null, avatar_url: null }));
    const employees = state.missingEmployee ? [] : [{ id: EMPLOYEE_A, profile_id: STAFF_A, business_id: BUSINESS_A, display_name: 'Stylist A', is_active: true }, { id: EMPLOYEE_B, profile_id: STAFF_B, business_id: BUSINESS_A, display_name: 'Stylist B', is_active: true }];
    if (options.ambiguousEmployee) employees.push({ id: '30000000-0000-4000-8000-000000000003', profile_id: STAFF_A, business_id: BUSINESS_A, display_name: 'Ambiguous mapping', is_active: true });
    const memberships = (options.missingMembership ? [] : [STAFF_A, STAFF_B]).map(id => ({ id: `membership-${id}`, business_id: BUSINESS_A, profile_id: id, role: state.role }));
    const tables: Record<string, unknown[]> = {
      profiles, employees, memberships,
      businesses: [{ id: BUSINESS_A, name: 'Fixture PAPI salon', timezone: 'Europe/Bratislava', onboarding_completed: true }],
      appointments: state.rows,
      services: [{ id: 'service-fixture', business_id: BUSINESS_A, name_sk: 'Dámsky strih', price: 30, is_active: true }],
    };
    if (table === 'appointments') {
      state.queries.push(url);
      if (state.error) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Fixture unavailable' }) });
      const delay = state.delayNextRead; state.delayNextRead = null; if (delay) await delay;
    }
    let rows = [...(tables[table] ?? [])].filter(row => [...url.searchParams].every(([key, value]) => matches(row as Record<string, unknown>, key, value)));
    const customerSearch = url.searchParams.get('csearch.full_name');
    const serviceSearch = url.searchParams.get('ssearch.name_sk');
    if (customerSearch && table === 'appointments') {
      const customerTerm = customerSearch.replace(/^ilike\./, '').replaceAll('%', '').replaceAll('*', '').toLocaleLowerCase();
      const serviceTerm = (serviceSearch ?? '').replace(/^ilike\./, '').replaceAll('%', '').replaceAll('*', '').toLocaleLowerCase();
      rows = rows.filter(row => { const appt = row as FixtureAppointment; return appt.customers.full_name.toLocaleLowerCase().includes(customerTerm) || (!!serviceTerm && appt.services.name_sk.toLocaleLowerCase().includes(serviceTerm)); });
    }
    const searchOr = url.searchParams.get('or');
    if (searchOr && table === 'appointments') {
      const terms = [...searchOr.matchAll(/ilike\.\*([^*]+)\*/g)].map(match => match[1].toLocaleLowerCase());
      if (terms.length) rows = rows.filter(row => terms.some(term => JSON.stringify(row).toLocaleLowerCase().includes(term)));
    }
    const total = rows.length;
    const order = url.searchParams.get('order');
    if (order?.startsWith('start_at')) rows.sort((a, b) => String((a as FixtureAppointment).start_at).localeCompare(String((b as FixtureAppointment).start_at)) * (order.includes('.desc') ? -1 : 1));
    const range = request.headers()['range'];
    const offset = Number(url.searchParams.get('offset') ?? range?.split('-')[0] ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? (range ? Number(range.split('-')[1]) - offset + 1 : total));
    rows = rows.slice(offset, offset + limit);
    const isObject = request.headers()['accept']?.includes('application/vnd.pgrst.object+json');
    const headers = { 'content-range': `${rows.length ? `${offset}-${offset + rows.length - 1}` : '*'}/${total}`, 'access-control-expose-headers': 'content-range' };
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: request.method() === 'HEAD' ? '' : JSON.stringify(isObject ? rows[0] ?? null : rows) });
  });
  return state;
}
export async function switchFixtureAccount(page: Page, userId: string) {
  const session = fixtureSession(userId);
  await page.evaluate(session => {
    const key = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token')) ?? 'sb-booking-fixture-auth-token';
    const oldValue = localStorage.getItem(key);
    localStorage.setItem(key, JSON.stringify(session));
    window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue: JSON.stringify(session), storageArea: localStorage }));
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: 'SIGNED_IN', session });
    channel.close();
  }, session);
}
