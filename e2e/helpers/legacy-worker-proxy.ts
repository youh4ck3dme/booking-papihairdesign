import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A real HTTP origin is needed: browser worker-script updates can bypass Playwright routing. */
export async function legacyWorkerProxy(target: string) {
  let legacy = true;
  let legacyResponses = 0;
  const server = createServer((incoming, outgoing) => {
    if (legacy && incoming.url?.split('?')[0] === '/sw.js') {
      legacyResponses++;
      outgoing.writeHead(200, { 'content-type': 'application/javascript', 'service-worker-allowed': '/', 'cache-control': 'no-store' });
      outgoing.end(`
        self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
        self.addEventListener('activate', event => event.waitUntil((async () => {
          const cache = await caches.open('supabase-api-cache');
          await cache.put('https://booking-fixture.invalid/rest/v1/appointments', new Response('[{"customer":"LEGACY PRIVATE"}]'));
          await self.clients.claim();
        })()));
      `);
      return;
    }
    const upstream = request(new URL(incoming.url ?? '/', target), { method: incoming.method, headers: { ...incoming.headers, host: new URL(target).host } }, response => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', () => { outgoing.writeHead(502); outgoing.end('Local preview unavailable'); });
    incoming.pipe(upstream);
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    useCurrentWorker: () => { legacy = false; },
    legacyResponses: () => legacyResponses,
    close: async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}
