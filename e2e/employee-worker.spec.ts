import { test, expect } from '@playwright/test';
import { installEmployeeFixture, fixtureSession, FIXED_NOW } from './helpers/employee-fixture';

test.use({ serviceWorkers: 'allow', locale: 'sk-SK' });
import { legacyWorkerProxy } from './helpers/legacy-worker-proxy';
const VERSION = 'papi-private-api-v1';

async function workerVersion(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) return null;
    return new Promise<string | null>(resolve => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => resolve(null), 1000);
      channel.port1.onmessage = event => { clearTimeout(timeout); resolve(event.data?.version ?? null); };
      controller.postMessage({ type: 'PAPI_PRIVATE_VERSION' }, [channel.port2]);
    });
  });
}

test('active service worker never retains private API data after logout or offline revisit', async ({ page, context }) => {
  await page.clock.install({ time: new Date(FIXED_NOW) });
  const fixture = await installEmployeeFixture(context);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Dnes', exact: true })).toBeVisible();
  await expect(page.getByText('Anna Pending', { exact: true }).first()).toBeVisible();
  await expect.poll(() => workerVersion(page)).toBe(VERSION);
  const cachedPrivateUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) if (request.url.includes('/rest/v1/')) urls.push(request.url);
    }
    return urls;
  });
  expect(cachedPrivateUrls).toEqual([]);
  await page.getByRole('button', { name: 'Môj profil', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Odhlásiť sa', exact: true }).click();
  await expect(page).toHaveURL(/\/auth/);
  fixture.offline = true;
  await context.setOffline(true);
  await page.goto('/admin');
  await expect(page.getByText('Anna Pending', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Eva Confirmed', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(async () => (await caches.keys()).includes('supabase-api-cache'))).toBe(false);
  expect(fixture.blocked).toEqual([]);
});

test('old worker is upgraded and its shared API cache removed before private dashboard queries', async ({ page, context }, testInfo) => {
  await page.clock.install({ time: new Date(FIXED_NOW) });
  const fixture = await installEmployeeFixture(context, { signedIn: false });
  const proxy = await legacyWorkerProxy(String(testInfo.project.use.baseURL));
  try {
    await page.goto(`${proxy.origin}/privacy`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes('supabase-api-cache'))).toBe(true);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    expect(proxy.legacyResponses()).toBeGreaterThan(0);
    expect(await workerVersion(page)).toBe(null);
    expect(fixture.queries).toHaveLength(0);
    proxy.useCurrentWorker();
    const readVersions: (string | null)[] = [];
    fixture.onPrivateRequest = async () => { readVersions.push(await workerVersion(page)); };
    await page.evaluate(session => localStorage.setItem('sb-booking-fixture-auth-token', JSON.stringify(session)), fixtureSession());
    await page.goto(`${proxy.origin}/admin`);
    await expect(page.getByText('Anna Pending', { exact: true }).first()).toBeVisible();
    await expect.poll(() => workerVersion(page)).toBe(VERSION);
    expect(await page.evaluate(async () => (await caches.keys()).includes('supabase-api-cache'))).toBe(false);
    await expect(page.getByText('LEGACY PRIVATE')).toHaveCount(0);
    expect(fixture.queries.length).toBeGreaterThan(0);
    expect(readVersions.length).toBeGreaterThan(0);
    expect(readVersions.every(version => version === VERSION)).toBe(true);
    expect(fixture.blocked).toEqual([]);
  } finally {
    await proxy.close();
  }
});
