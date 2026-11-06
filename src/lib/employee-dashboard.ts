export type EmployeeStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export interface EmployeeAppointment {
  id: string;
  business_id: string;
  employee_id: string;
  start_at: string;
  end_at: string;
  status: EmployeeStatus;
  updated_at?: string;
  customers: { full_name: string | null; phone: string | null; email: string | null } | null;
  services: { name_sk: string; name_en?: string | null; price: number } | null;
  employees: { display_name: string } | null;
}

export const EMPLOYEE_PAGE_SIZE = 25;
export const PRIVATE_WORKER_VERSION = 'papi-private-api-v1';
export const SALON_TIMEZONE = 'Europe/Bratislava';

export function allowedEmployeeTransitions(status: EmployeeStatus): EmployeeStatus[] {
  if (status === 'pending') return ['confirmed', 'cancelled'];
  if (status === 'confirmed') return ['completed', 'cancelled'];
  return [];
}

export function salonDateKey(value: Date | string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SALON_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

function midnightInSalon(key: string): Date {
  const target = Date.parse(`${key}T00:00:00Z`);
  let instant = target;
  // Offset is calculated separately at each midnight, including 23/25-hour DST days.
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: SALON_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const number = (type: string) => Number(parts.find(part => part.type === type)?.value);
    const wall = Date.UTC(number('year'), number('month') - 1, number('day'), number('hour'), number('minute'), number('second'));
    const next = instant + target - wall;
    if (next === instant) break;
    instant = next;
  }
  return new Date(instant);
}

export function salonDayRange(value: Date | string): { start: string; end: string } {
  const key = salonDateKey(value);
  const next = new Date(`${key}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: midnightInSalon(key).toISOString(), end: midnightInSalon(next.toISOString().slice(0, 10)).toISOString() };
}

export function salonTime(value: Date | string, language: 'sk' | 'en' = 'sk'): string {
  return new Intl.DateTimeFormat(language === 'sk' ? 'sk-SK' : 'en-GB', {
    timeZone: SALON_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value));
}

export async function clearLegacyPrivateCache(): Promise<void> {
  if ('caches' in window) await caches.delete('supabase-api-cache');
}

export function privateWorkerVersion(worker: ServiceWorker): Promise<boolean> {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => { channel.port1.close(); resolve(false); }, 700);
    channel.port1.onmessage = event => {
      window.clearTimeout(timer);
      channel.port1.close();
      resolve(event.data?.version === PRIVATE_WORKER_VERSION);
    };
    try { worker.postMessage({ type: 'PAPI_PRIVATE_VERSION' }, [channel.port2]); }
    catch { window.clearTimeout(timer); channel.port1.close(); resolve(false); }
  });
}

/** No private REST request is allowed while an old shared-cache worker controls this page. */
export async function ensurePrivateWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const active = navigator.serviceWorker.controller ?? registration?.active;
  if (!active) return; // Fresh online page without a controlling worker.
  if (await privateWorkerVersion(active)) { await clearLegacyPrivateCache(); return; }
  if (!registration || !navigator.onLine) throw new Error('Aktualizujte aplikáciu online a obnovte stránku.');
  await registration.update();
  const replacement = registration.waiting ?? registration.installing;
  if (!replacement) throw new Error('Aktualizujte aplikáciu a obnovte stránku.');
  if (replacement.state !== 'installed' && replacement.state !== 'activated') {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { replacement.removeEventListener('statechange', changed); reject(new Error('Aktualizácia aplikácie ešte nie je pripravená. Obnovte stránku.')); }, 10000);
      const changed = () => {
        if (replacement.state === 'installed' || replacement.state === 'activated') {
          window.clearTimeout(timer); replacement.removeEventListener('statechange', changed); resolve();
        } else if (replacement.state === 'redundant') {
          window.clearTimeout(timer); replacement.removeEventListener('statechange', changed); reject(new Error('Aktualizácia aplikácie zlyhala. Obnovte stránku.'));
        }
      };
      replacement.addEventListener('statechange', changed);
      changed();
    });
  }
  if (!await privateWorkerVersion(replacement)) throw new Error('Aktualizujte aplikáciu a obnovte stránku.');
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', changed); reject(new Error('Obnovte stránku pre dokončenie aktualizácie.')); }, 10000);
    const changed = () => {
      window.clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', changed); resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    replacement.postMessage({ type: 'PAPI_ACTIVATE_PRIVATE_WORKER' });
  });
  if (!navigator.serviceWorker.controller || !await privateWorkerVersion(navigator.serviceWorker.controller)) {
    throw new Error('Obnovte stránku pre dokončenie aktualizácie.');
  }
  await clearLegacyPrivateCache();
}
