import { PAPI_WEBSITE_URL } from './papi-links';
import type { BookingLanguage } from './booking-language';

type PapiParentMessage = { type: 'papi:navigate-home' | 'papi:host-request' } | { type: 'papi:language'; language: BookingLanguage };

export function trustedParentOrigin(): string | null {
  if (window.parent === window || !document.referrer) return null;
  try {
    const origin = new URL(document.referrer).origin;
    const allowedOrigin = new URL(PAPI_WEBSITE_URL).origin;
    const allowed = origin === allowedOrigin || (allowedOrigin === 'https://papihairdesign.sk' && origin === 'https://www.papihairdesign.sk');
    return allowed ? origin : null;
  } catch { return null; }
}

export function isPapiParentMessage(event: MessageEvent): boolean {
  const origin = trustedParentOrigin();
  return origin !== null && event.origin === origin && event.source === window.parent;
}

export function notifyPapiParent(message: PapiParentMessage): boolean {
  const allowedOrigin = trustedParentOrigin();
  if (!allowedOrigin) return false;
  try {
    window.parent.postMessage(message, allowedOrigin);
    return true;
  } catch { return false; }
}
