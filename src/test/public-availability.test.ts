import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSlots, type SlotGeneratorInput } from '../lib/availability';
import { salonTime } from '../lib/employee-dashboard';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });
function input(year: number, month: number, day: number): SlotGeneratorInput {
  const date = new Date(year, month - 1, day);
  const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
  return { date, timeZone: 'Europe/Bratislava', serviceDuration: 45, serviceBuffer: 0,
    openingHours: { [dayName]: { open: true, start: '09:00', end: '12:00' } },
    employeeSchedules: [{ day_of_week: dayName, start_time: '09:00', end_time: '12:00' }], existingAppointments: [], slotInterval: 15 };
}
describe('public booking salon-time slots', () => {
  it.each([[2026, 11, 7, '2026-11-07T08:00:00.000Z'], [2026, 3, 29, '2026-03-29T07:00:00.000Z'], [2026, 10, 25, '2026-10-25T08:00:00.000Z']])('maps9am to the correct UTC instant on %i-%i-%i', (year, month, day, instant) => {
    const slots = generateSlots(input(year as number, month as number, day as number));
    expect(slots[0].toISOString()).toBe(instant);
    expect(salonTime(slots[0])).toBe('09:00');
  });
  it('excludes real10am Bratislava occupancy including partial service overlaps', () => {
    const slots = generateSlots({ ...input(2026, 11, 7), existingAppointments: [{ start_at: '2026-11-07T09:00:00Z', end_at: '2026-11-07T09:45:00Z' }] });
    const labels = slots.map(slot => salonTime(slot));
    expect(labels).toContain('09:00'); expect(labels).toContain('10:45');
    expect(labels).not.toContain('09:30'); expect(labels).not.toContain('10:00'); expect(labels).not.toContain('10:15'); expect(labels).not.toContain('10:30');
  });
  it('preserves browser-local behavior for existing callers without a timezone option', () => {
    const options = input(2026, 11, 7); delete options.timeZone;
    const slots = generateSlots(options);
    expect(slots[0].getHours()).toBe(9);
  });
});
