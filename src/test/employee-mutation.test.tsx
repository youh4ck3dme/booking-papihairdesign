import { type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmployeeAppointment } from '../lib/employee-dashboard';

const fixtures = vi.hoisted(() => ({
  worker: vi.fn(), from: vi.fn(),
  auth: { user: { id: 'employee-user-a' }, session: { user: { id: 'employee-user-a' }, access_token: 'token-a' }, loading: false, authError: null },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => fixtures.auth }));
vi.mock('@/hooks/useBusiness', () => ({ useBusiness: () => ({ activeMembership: { business_id: 'business-a', role: 'employee' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fixtures.from } }));
vi.mock('@/lib/employee-dashboard', async importOriginal => ({ ...await importOriginal<typeof import('../lib/employee-dashboard')>(), ensurePrivateWorker: fixtures.worker }));
import { useEmployeeStatusUpdate } from '../hooks/useEmployeeDashboard';

const appointment: EmployeeAppointment = {
  id: 'appointment-a', business_id: 'business-a', employee_id: 'employee-a', status: 'pending',
  start_at: '2026-11-06T10:00:00Z', end_at: '2026-11-06T10:45:00Z',
  customers: null, services: null, employees: null,
};
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function mountHook() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(['employee', 'scope', 'employee-user-a', 'business-a'], 'employee-a');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useEmployeeStatusUpdate(), { wrapper }), client };
}
function queryBuilder() {
  let signal: AbortSignal | undefined;
  const headers = new Map<string, string>();
  const builder = {
    update: vi.fn(() => builder), eq: vi.fn(() => builder), select: vi.fn(() => builder),
    setHeader: vi.fn((name: string, value: string) => { headers.set(name, value); return builder; }),
    abortSignal: vi.fn((value: AbortSignal) => { signal = value; return builder; }),
    maybeSingle: vi.fn(async () => ({ data: { id: appointment.id }, error: null })),
  };
  fixtures.from.mockReturnValue(builder);
  return { builder, headers, getSignal: () => signal };
}
beforeEach(() => {
  fixtures.worker.mockReset(); fixtures.from.mockReset(); fixtures.worker.mockResolvedValue(undefined);
  fixtures.auth.user = { id: 'employee-user-a' };
  fixtures.auth.session = { user: { id: 'employee-user-a' }, access_token: 'token-a' };
});
afterEach(cleanup);

describe('employee mutation identity lifecycle', () => {
  it('does not send an update when the hook unmounts while waiting for worker activation', async () => {
    const gate = deferred(); fixtures.worker.mockReturnValue(gate.promise);
    const { result, unmount, client } = mountHook();
    const outcome = result.current.mutateAsync({ appointment, newStatus: 'confirmed' }).catch(error => error);
    await waitFor(() => expect(fixtures.worker).toHaveBeenCalledOnce());
    unmount();
    await act(async () => { gate.resolve(); });
    expect(await outcome).toMatchObject({ message: 'EMPLOYEE_FORBIDDEN' });
    expect(fixtures.from).not.toHaveBeenCalled();
    client.clear();
  });

  it('aborts an in-flight request when the authenticated subtree unmounts', async () => {
    const { builder, getSignal } = queryBuilder();
    builder.maybeSingle.mockImplementation(() => new Promise((_resolve, reject) => {
      getSignal()!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const { result, unmount, client } = mountHook();
    const outcome = result.current.mutateAsync({ appointment, newStatus: 'confirmed' }).catch(error => error);
    await waitFor(() => expect(builder.maybeSingle).toHaveBeenCalledOnce());
    expect(getSignal()?.aborted).toBe(false);
    unmount();
    expect(getSignal()?.aborted).toBe(true);
    expect(await outcome).toMatchObject({ name: 'AbortError' });
    client.clear();
  });

  it('rejects the old queued action when the hook stays mounted across an identity change', async () => {
    const gate = deferred(); fixtures.worker.mockReturnValue(gate.promise);
    const { builder } = queryBuilder();
    const { result, rerender, unmount, client } = mountHook();
    const outcome = result.current.mutateAsync({ appointment, newStatus: 'confirmed' }).catch(error => error);
    await waitFor(() => expect(fixtures.worker).toHaveBeenCalledOnce());
    client.setQueryData(['employee', 'scope', 'employee-user-b', 'business-a'], 'employee-b');
    fixtures.auth.user = { id: 'employee-user-b' };
    fixtures.auth.session = { user: { id: 'employee-user-b' }, access_token: 'token-b' };
    rerender();
    await act(async () => { gate.resolve(); });
    expect(await outcome).toMatchObject({ message: 'EMPLOYEE_FORBIDDEN' });
    expect(builder.update).not.toHaveBeenCalled();
    unmount(); client.clear();
  });

  it('binds the queued click to its captured user token instead of a later SDK account', async () => {
    const gate = deferred(); fixtures.worker.mockReturnValue(gate.promise);
    const { builder, headers } = queryBuilder();
    let sdkToken = 'token-a';
    const sentCredentials: string[] = [];
    builder.maybeSingle.mockImplementation(async () => {
      sentCredentials.push(headers.get('Authorization') ?? `Bearer ${sdkToken}`);
      return { data: { id: appointment.id }, error: null };
    });
    const { result, unmount, client } = mountHook();
    const outcome = result.current.mutateAsync({ appointment, newStatus: 'confirmed' });
    await waitFor(() => expect(fixtures.worker).toHaveBeenCalledOnce());
    // Model the SDK switching its global account before the AuthContext event commits.
    sdkToken = 'privileged-token-b';
    await act(async () => { gate.resolve(); await outcome; });
    expect(builder.setHeader).toHaveBeenCalledExactlyOnceWith('Authorization', 'Bearer token-a');
    expect(sentCredentials).toEqual(['Bearer token-a']);
    unmount(); client.clear();
  });
});
