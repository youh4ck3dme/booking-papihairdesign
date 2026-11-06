export const PRODUCTION_PAPI_WEBSITE_URL = 'https://papihairdesign.sk/';

export function resolvePapiWebsiteUrl(value?: string): string {
  const raw = value?.trim() || PRODUCTION_PAPI_WEBSITE_URL;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Invalid VITE_PAPI_WEBSITE_URL'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_PAPI_WEBSITE_URL must be an HTTPS homepage URL (HTTP is local-only), without credentials, query or fragment');
  }
  return url.href;
}
