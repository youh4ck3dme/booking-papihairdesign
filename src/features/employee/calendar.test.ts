import { describe, expect, it } from 'vitest';
import { appointmentOverlapsRange } from './calendar';

describe('calendar day overlap uses instants, not ISO string ordering', () => {
  const range = { start: '2026-11-05T23:00:00.000Z', end: '2026-11-06T23:00:00.000Z' };
  it('excludes a reservation ending exactly at the start with a numeric offset', () => {
    expect(appointmentOverlapsRange({ start_at: '2026-11-05T22:00:00+00:00', end_at: '2026-11-05T23:00:00+00:00' }, range)).toBe(false);
  });
  it('excludes a reservation starting exactly at the exclusive end with a numeric offset', () => {
    expect(appointmentOverlapsRange({ start_at: '2026-11-06T23:00:00+00:00', end_at: '2026-11-07T00:00:00+00:00' }, range)).toBe(false);
  });
  it('includes an overnight appointment in each day it overlaps', () => {
    expect(appointmentOverlapsRange({ start_at: '2026-11-05T23:30:00+01:00', end_at: '2026-11-06T00:30:00+01:00' }, range)).toBe(true);
  });
});
