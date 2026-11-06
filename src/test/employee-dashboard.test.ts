import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowedEmployeeTransitions, clearLegacyPrivateCache, ensurePrivateWorker, salonDateKey, salonDayRange, salonTime } from '../lib/employee-dashboard';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); Reflect.deleteProperty(navigator, 'serviceWorker'); Reflect.deleteProperty(navigator, 'onLine'); });

describe('employee appointment permissions', () => {
  it('allows confirmation/cancellation then completion/cancellation, without reopening terminal states', () => {
    expect(allowedEmployeeTransitions('pending')).toEqual(['confirmed', 'cancelled']);
    expect(allowedEmployeeTransitions('confirmed')).toEqual(['completed', 'cancelled']);
    expect(allowedEmployeeTransitions('completed')).toEqual([]);
    expect(allowedEmployeeTransitions('cancelled')).toEqual([]);
  });
});

describe('salon calendar dates independent of browser timezone', () => {
  it('uses Bratislava date across UTC midnight', () => {
    expect(salonDateKey('2026-07-01T22:30:00Z')).toBe('2026-07-02');
    expect(salonTime('2026-07-01T22:30:00Z')).toBe('00:30');
    expect(salonTime('2026-01-01T23:30:00Z', 'en')).toBe('00:30');
  });
  it('returns exclusive local-midnight bounds on normal days', () => {
    expect(salonDayRange('2026-11-06')).toEqual({ start: '2026-11-05T23:00:00.000Z', end: '2026-11-06T23:00:00.000Z' });
  });
  it('handles the 23-hour spring day and the 25-hour autumn day', () => {
    expect(salonDayRange('2026-03-29')).toEqual({ start: '2026-03-28T23:00:00.000Z', end: '2026-03-29T22:00:00.000Z' });
    expect(salonDayRange('2026-10-25')).toEqual({ start: '2026-10-24T22:00:00.000Z', end: '2026-10-25T23:00:00.000Z' });
  });
});

describe('private API worker guard', () => {
  it('allows a fresh non-controlled browser without modifying unrelated caches', async () => {
    const remove = vi.fn();
    vi.stubGlobal('caches', { delete: remove });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => undefined, controller: null } });
    await ensurePrivateWorker();
    await clearLegacyPrivateCache();
    expect(remove).toHaveBeenCalledExactlyOnceWith('supabase-api-cache');
  });
  it('fails closed when an old controlling worker cannot be updated offline', async () => {
    class Channel {
      port1 = { close: vi.fn(), onmessage: null };
      port2 = {};
    }
    vi.stubGlobal('MessageChannel', Channel);
    vi.spyOn(window, 'setTimeout').mockImplementation(((callback: () => void) => { queueMicrotask(callback); return 1; }) as typeof window.setTimeout);
    const update = vi.fn();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => ({ update }), controller: { postMessage: vi.fn() } } });
    await expect(ensurePrivateWorker()).rejects.toThrow('online');
    expect(update).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });
});
