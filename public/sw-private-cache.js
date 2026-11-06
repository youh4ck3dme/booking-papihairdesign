/* Private dashboard data must never survive in the former shared REST cache. */
self.addEventListener('activate', event => {
  event.waitUntil(caches.delete('supabase-api-cache').then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'PAPI_PRIVATE_VERSION') {
    event.ports[0]?.postMessage({ version: 'papi-private-api-v1' });
  }
  if (event.data?.type === 'PAPI_ACTIVATE_PRIVATE_WORKER') self.skipWaiting();
});
