import type { BrowserContext } from '@playwright/test';
import { EMPLOYEE_A, installEmployeeFixture } from './employee-fixture';
export const PUBLIC_BUSINESS = 'a1b2c3d4-0000-0000-0000-000000000001';
export interface BusyInterval { start_at: string; end_at: string }
export async function installPublicBookingFixture(context: BrowserContext, busyIntervals: BusyInterval[] = [], options: { simulateCreate?: boolean; initialEmployeeName?: string; auth?: Parameters<typeof installEmployeeFixture>[1] } = {}) {
  const state = await installEmployeeFixture(context, { signedIn: false, ...options.auth });
  const busyRequests: Record<string, unknown>[] = [];
  const simulatedCreates: Record<string, unknown>[] = [];
  const employeeRequests: Record<string, unknown>[] = [];
  const fixture = Object.assign(state, { busyRequests, busyError: false, simulatedCreates, employeeRequests, delayScopedEmployees: undefined as Promise<void> | undefined });
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  await context.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== 'booking-fixture.invalid') {
      state.blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort();
    }
    if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/get_public_bookable_employees') {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (Object.keys(body).length !== 2 || body._business_id !== PUBLIC_BUSINESS || ![null, 'service-1'].includes(body._service_id as string | null)) {
        state.blocked.push('INVALID public employees read'); return route.fulfill({ status: 400, body: '{}' });
      }
      employeeRequests.push(body);
      if (body._service_id !== null && fixture.delayScopedEmployees) await fixture.delayScopedEmployees;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: EMPLOYEE_A, display_name: body._service_id === null ? options.initialEmployeeName ?? 'Test Stylist' : 'Test Stylist', photo_url: null }]) });
    }
    if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/get_public_busy_intervals') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const start = Date.parse(String(body._start)); const end = Date.parse(String(body._end));
      if (body._business_id !== PUBLIC_BUSINESS || body._employee_id !== EMPLOYEE_A || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 26 * 3600_000) {
        state.blocked.push('INVALID public busy read'); return route.fulfill({ status: 400, body: '{}' });
      }
      busyRequests.push(body);
      if (fixture.busyError) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Fixture availability RPC is unavailable' }) });
      // This specifically allowlisted POST is a read-only timestamp RPC, not a reservation write.
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(busyIntervals) });
    }
    if (options.simulateCreate === true && request.method() === 'POST' && url.pathname === '/rest/v1/rpc/create_public_booking') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const expected = { business_id: PUBLIC_BUSINESS, service_id: 'service-1', employee_id: EMPLOYEE_A, start_at: '2026-11-07T10:00:00.000Z', customer_name: 'Test Fixture', customer_email: 'fixture@example.invalid' };
      if (Object.keys(body).length !== Object.keys(expected).length || !Object.entries(expected).every(([key, value]) => body[key] === value)) {
        state.blocked.push('INVALID simulated create payload'); return route.fulfill({ status: 400, body: '{}' });
      }
      // Only the explicitly opted-in test simulates this mutation entirely in memory.
      simulatedCreates.push(body);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ claim_token: 'fixture-claim-not-a-real-reservation', customer_email: 'fixture@example.invalid', customer_name: 'Test Fixture' }) });
    }
    if (request.method() !== 'GET') {
      state.blocked.push(`${request.method()} ${url.pathname}`); return route.fulfill({ status: 405, body: '{}' });
    }
    const table = url.pathname.split('/').pop() ?? '';
    if (['appointments', 'employees', 'memberships', 'employee_services'].includes(table)) {
      state.blocked.push(`Forbidden public direct ${table} read`); return route.fulfill({ status: 403, body: '{}' });
    }
    if (table === 'businesses' && (url.searchParams.get('select') ?? '*').split(',').some(column => !['opening_hours', 'lead_time_minutes', 'max_days_ahead'].includes(column.trim()))) {
      state.blocked.push('Forbidden public business projection'); return route.fulfill({ status: 403, body: '{}' });
    }
    const tables: Record<string, unknown[]> = {
      businesses: [{ max_days_ahead: 60, lead_time_minutes: 0, opening_hours: Object.fromEntries(days.map(day => [day, { open: true, start: '10:00', end: '18:00' }])) }],
      services: [{ id: 'service-1', name_sk: 'Dámske strihy', category: 'damske', subcategory: 'STRIH', price: 30, duration_minutes: 45, buffer_minutes: 0, is_active: true }],
      schedules: days.map(day => ({ employee_id: EMPLOYEE_A, day_of_week: day, start_time: '10:00', end_time: '18:00' })),
    };
    const rows = tables[table] ?? [];
    const single = request.headers()['accept']?.includes('application/vnd.pgrst.object+json');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(single ? rows[0] ?? null : rows) });
  });
  return fixture;
}
