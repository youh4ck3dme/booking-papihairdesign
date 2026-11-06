/** ISO strings can use different offsets/precision for the same instant. */
export function appointmentOverlapsRange(
  appointment: { start_at: string; end_at: string },
  range: { start: string; end: string },
): boolean {
  return Date.parse(appointment.start_at) < Date.parse(range.end)
    && Date.parse(appointment.end_at) > Date.parse(range.start);
}
