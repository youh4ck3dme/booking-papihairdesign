/**
 * Availability Engine
 * Generates available time slots respecting:
 * - Business hours (from business_hours table with mode support)
 * - Date overrides (from business_date_overrides table)
 * - Employee schedules
 * - Service duration + buffer
 * - Lead time & max days ahead
 * - Existing appointments (conflict detection)
 * - Timezone (Europe/Bratislava default)
 */

import { addMinutes, startOfDay, isBefore, isAfter, format } from "date-fns";

export interface BusinessHours {
  [day: string]: { open: boolean; start: string; end: string };
}

export interface BusinessHourEntry {
  day_of_week: string;
  mode: "open" | "closed" | "on_request";
  start_time: string;
  end_time: string;
}

export interface DateOverrideEntry {
  override_date: string;
  mode: "open" | "closed" | "on_request";
  start_time: string | null;
  end_time: string | null;
}

export interface EmployeeSchedule {
  day_of_week: string;
  start_time: string; // "HH:mm"
  end_time: string;
}

export interface ExistingAppointment {
  start_at: string;
  end_at: string;
}

export interface SlotGeneratorInput {
  date: Date;
  serviceDuration: number;
  serviceBuffer: number;
  openingHours: BusinessHours;
  businessHourEntries?: BusinessHourEntry[];
  dateOverrides?: DateOverrideEntry[];
  employeeSchedules: EmployeeSchedule[];
  existingAppointments: ExistingAppointment[];
  leadTimeMinutes?: number;
  slotInterval?: number;
  /** Interpret the selected calendar date and schedule in this zone; omitted keeps legacy local callers. */
  timeZone?: string;
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function setTimeOnDate(date: Date, timeStr: string, timeZone?: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  if (!timeZone) {
    const local = new Date(date);
    local.setHours(h, m || 0, 0, 0);
    return local;
  }
  // `date` represents the selected logical calendar day in the caller's UI.
  // Convert that day + salon wall clock to a real UTC instant, independent of
  // the visitor's timezone. Recompute the offset at this date (including DST).
  const wall = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), h, m || 0);
  let instant = wall;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
    const actual = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
    if (actual === wall) return new Date(instant);
    instant += wall - actual;
  }
  // Nonexistent wall times in a spring DST gap must not invent a bookable slot.
  return new Date(Number.NaN);
}

/**
 * Get effective business intervals for a given date, considering overrides.
 * Returns null if closed/on_request (no slots), or array of {start, end} intervals.
 */
export function getEffectiveIntervals(
  date: Date,
  businessHourEntries?: BusinessHourEntry[],
  dateOverrides?: DateOverrideEntry[],
  legacyHours?: BusinessHours,
): { start: string; end: string }[] | null {
  const dayName = DAY_NAMES[date.getDay()];
  const dateStr = format(date, "yyyy-MM-dd");

  // Check date overrides first
  if (dateOverrides?.length) {
    const dayOverrides = dateOverrides.filter((o) => o.override_date === dateStr);
    if (dayOverrides.length) {
      // If any closed override exists, no slots
      if (dayOverrides.some((o) => o.mode === "closed")) return null;
      // If on_request, no slots
      if (dayOverrides.some((o) => o.mode === "on_request")) return null;
      // Collect open intervals
      const intervals = dayOverrides
        .filter((o) => o.mode === "open" && o.start_time && o.end_time)
        .map((o) => ({ start: o.start_time!.slice(0, 5), end: o.end_time!.slice(0, 5) }));
      return intervals.length ? intervals : null;
    }
  }

  // Use new business_hours table if available
  if (businessHourEntries?.length) {
    const dayEntries = businessHourEntries.filter((h) => h.day_of_week === dayName);
    if (!dayEntries.length) return null;
    // closed or on_request = no slots
    if (dayEntries.every((h) => h.mode !== "open")) return null;
    return dayEntries
      .filter((h) => h.mode === "open")
      .map((h) => ({ start: h.start_time.slice(0, 5), end: h.end_time.slice(0, 5) }));
  }

  // Fallback to legacy openingHours jsonb
  if (legacyHours) {
    const businessDay = legacyHours[dayName];
    if (!businessDay || !businessDay.open) return null;
    return [{ start: businessDay.start, end: businessDay.end }];
  }

  return null;
}

export function generateSlots(input: SlotGeneratorInput): Date[] {
  const {
    date,
    serviceDuration,
    serviceBuffer,
    openingHours,
    businessHourEntries,
    dateOverrides,
    employeeSchedules,
    existingAppointments,
    leadTimeMinutes = 0,
    slotInterval = 30,
    timeZone,
  } = input;

  const totalDuration = serviceDuration + serviceBuffer;
  const dayName = DAY_NAMES[date.getDay()];
  const slots: Date[] = [];

  // Get effective business intervals
  const intervals = getEffectiveIntervals(date, businessHourEntries, dateOverrides, openingHours);
  if (!intervals || !intervals.length) return slots;

  // Check employee schedule for this day
  const empDay = employeeSchedules.find((s) => s.day_of_week === dayName);
  if (!empDay) return slots;

  const empStart = setTimeOnDate(date, empDay.start_time, timeZone);
  const empEnd = setTimeOnDate(date, empDay.end_time, timeZone);

  if (!Number.isFinite(empStart.getTime()) || !Number.isFinite(empEnd.getTime())) return [];

  const now = new Date();
  const earliestAllowed = addMinutes(now, leadTimeMinutes);

  const conflicts = existingAppointments.map((a) => ({
    start: new Date(a.start_at).getTime(),
    end: new Date(a.end_at).getTime(),
  }));

  // Generate slots for each business interval
  for (const interval of intervals) {
    const businessStart = setTimeOnDate(date, interval.start, timeZone);
    const businessEnd = setTimeOnDate(date, interval.end, timeZone);

    if (!Number.isFinite(businessStart.getTime()) || !Number.isFinite(businessEnd.getTime())) continue;

    // Effective window = intersection of business interval and employee schedule
    const windowStart = isAfter(empStart, businessStart) ? empStart : businessStart;
    const windowEnd = isBefore(empEnd, businessEnd) ? empEnd : businessEnd;

    if (isAfter(windowStart, windowEnd) || windowStart.getTime() === windowEnd.getTime()) continue;

    let cursor = new Date(windowStart);
    while (cursor < windowEnd) {
      const slotEnd = addMinutes(cursor, totalDuration);
      if (isAfter(slotEnd, windowEnd)) break;

      if (!isBefore(cursor, earliestAllowed)) {
        const slotStartMs = cursor.getTime();
        const slotEndMs = slotEnd.getTime();
        const hasConflict = conflicts.some(
          (c) => slotStartMs < c.end && slotEndMs > c.start
        );
        if (!hasConflict) {
          slots.push(new Date(cursor));
        }
      }

      cursor = addMinutes(cursor, slotInterval);
    }
  }

  return slots;
}

/**
 * Check if a specific slot is available
 */
export function isSlotAvailable(
  slotStart: Date,
  serviceDuration: number,
  serviceBuffer: number,
  existingAppointments: ExistingAppointment[]
): boolean {
  const slotEnd = addMinutes(slotStart, serviceDuration + serviceBuffer);
  const slotStartMs = slotStart.getTime();
  const slotEndMs = slotEnd.getTime();

  return !existingAppointments.some(
    (a) => slotStartMs < new Date(a.end_at).getTime() && slotEndMs > new Date(a.start_at).getTime()
  );
}
