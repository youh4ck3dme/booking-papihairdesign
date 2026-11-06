import { test, expect } from '@playwright/test';
import { installPublicBookingFixture } from './helpers/public-booking-fixture';

test.use({ locale: 'sk-SK', serviceWorkers: 'block' });
for (const [width, height] of [[240,640],[320,568],[390,844],[844,390],[768,1024],[1440,900]]) {
  test(`light booking language and offer reveal at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const writes: string[] = [];
    const privateReads: string[] = [];
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['127.0.0.1','localhost'].includes(url.hostname)) return route.continue();
      if (url.hostname.includes('supabase') || url.hostname === 'booking-fixture.invalid') {
        if (route.request().method() === 'POST' && url.pathname === '/rest/v1/rpc/get_public_bookable_employees') {
          const body = route.request().postDataJSON() as Record<string, unknown>;
          expect(Object.keys(body).sort()).toEqual(['_business_id', '_service_id']);
          expect(body._business_id).toBe('a1b2c3d4-0000-0000-0000-000000000001');
          expect([null, 'service-1']).toContain(body._service_id);
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 'c1000000-0000-0000-0000-000000000001', display_name: 'Test Stylist', photo_url: null }]) });
        }
        if (route.request().method() === 'POST' && url.pathname === '/rest/v1/rpc/get_public_busy_intervals') {
          const body = route.request().postDataJSON() as Record<string, unknown>;
          expect(body._business_id).toBe('a1b2c3d4-0000-0000-0000-000000000001');
          expect(body._employee_id).toBe('c1000000-0000-0000-0000-000000000001');
          expect(Number.isFinite(Date.parse(String(body._start)))).toBe(true);
          expect(Date.parse(String(body._end))).toBeGreaterThan(Date.parse(String(body._start)));
          // Explicit read-only RPC allowlist; all actual writes stay prohibited below.
          return route.fulfill({ contentType: 'application/json', body: '[]' });
        }
        if (route.request().method() !== 'GET') {
          writes.push(route.request().method() + ' ' + url.pathname);
          return route.fulfill({ status: 405, body: '{}' });
        }
        const table = url.pathname.split('/').pop();
        if (['appointments', 'employees', 'memberships', 'employee_services'].includes(table ?? '')) {
          privateReads.push(url.pathname); return route.fulfill({ status: 403, body: '{}' });
        }
        if (table === 'businesses') expect((url.searchParams.get('select') ?? '*').split(',').sort()).toEqual(['lead_time_minutes', 'max_days_ahead', 'opening_hours']);
        const rows: Record<string, unknown> = {
          businesses: [{ opening_hours: {}, lead_time_minutes: 60, max_days_ahead: 60 }],
          services: [{ id: 'service-1', name_sk: 'Dámske strihy', category: 'damske', subcategory: 'STRIH', price: 30, duration_minutes: 45, buffer_minutes: 0, is_active: true }],
        };
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows[table ?? ''] ?? []) });
      }
      return route.abort();
    });
    await page.goto('/?lang=sk#services');
    await expect(page).toHaveURL(/\/booking\?lang=sk#services$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Vyberte kategóriu' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vyberte kategóriu' })).toHaveCSS('font-family', /Bodoni Moda/);
    const headingFonts = await page.evaluate(() => document.fonts.load('500 24px "Bodoni Moda"', 'PAPI ĽŠŤŽÁÉÍÓÚÝČĎŇÔÄŔĹ').then(fonts => fonts.map(font => font.status)));
    expect(headingFonts.length).toBeGreaterThan(0);
    expect(headingFonts.every(status => status === 'loaded')).toBe(true);
    const logo = page.locator('header img[alt="PAPI HAIR DESIGN"]');
    await expect(logo).toHaveCount(1);
    await expect(logo).toBeInViewport({ ratio: 1 });
    expect(await logo.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([359, 142]);
    const logoBox = (await logo.boundingBox())!;
    if (width >= 320) expect(logoBox.width).toBeGreaterThanOrEqual(140);
    else expect(logoBox.width).toBeGreaterThanOrEqual(96);
    expect(Math.abs(logoBox.width / logoBox.height - 359 / 142)).toBeLessThan(0.01);
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    const dashboard = page.getByRole('link', { name: 'Dashboard', exact: true });
    const website = page.getByRole('link', { name: 'Späť na web', exact: true });
    await expect(dashboard).toHaveAttribute('href', '/admin');
    await expect(website).toHaveAttribute('href', 'https://papihairdesign.sk/');
    expect(await website.getAttribute('target')).toBeNull();
    for (const link of [dashboard, website]) {
      const box = (await link.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      await expect(link).toBeInViewport({ ratio: 1 });
    }
    expect(Math.abs((await dashboard.boundingBox())!.height - (await website.boundingBox())!.height)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const english = page.getByRole('button', { name: 'Switch to English', exact: true });
    expect(Math.round((await page.locator('.language-control').boundingBox())!.height)).toBe(36);
    expect(Math.round((await english.boundingBox())!.height)).toBe(28);
    expect(await english.evaluate(el => getComputedStyle(el, '::before').height)).toBe('44px');
    await english.focus();
    await page.keyboard.press('Enter');
    await expect(english).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Choose a category' })).toBeVisible();
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Back to website', exact: true })).toBeVisible();
    if ([320, 390, 768, 1440].includes(width)) {
      await page.screenshot({ path: test.info().outputPath(`booking-header-${width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'HAIRCUT', exact: true }).click();
    const services = page.getByRole('button', { name: 'Choose a service', exact: true });
    await expect(services).toBeInViewport();
    const serviceChoice = page.getByRole('radio', { name: "Women's haircuts", exact: true });
    await serviceChoice.focus();
    await page.keyboard.press('Space');
    await expect(serviceChoice).toBeChecked();
    await expect(serviceChoice.locator('..')).toHaveCSS('background-color', 'rgb(245, 237, 218)');
    const workers = page.getByRole('button', { name: 'Choose a stylist', exact: true });
    await expect(workers).toBeInViewport();
    await page.getByRole('button', { name: 'Prepnúť do slovenčiny', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Vyberte pracovníka', exact: true })).toBeVisible();
    await expect(page.getByText('Test Stylist', { exact: true })).toBeVisible();
    const workerChoice = page.getByRole('radio', { name: 'Test Stylist', exact: true });
    await workerChoice.focus();
    await page.keyboard.press('Space');
    await expect(workerChoice).toBeChecked();
    await expect(page.getByRole('heading', { name: 'Vyberte dátum', exact: true })).toBeVisible();
    for (const day of await page.locator('.booking-day').all()) {
      const box = (await day.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByRole('button', { name: 'Predchádzajúci mesiac', exact: true })).toBeVisible();
    if (width < 308) {
      const calendar = page.getByRole('region', { name: 'Kalendár termínov', exact: true });
      expect(await calendar.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
      await calendar.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => calendar.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
    for (const offer of await page.locator('.booking-offer').all()) {
      await expect(offer).toHaveCSS('transform', 'none');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Vyberte pracovníka', exact: true }).click();
    expect(await page.locator('[aria-label="Ponuka pracovníkov"]').evaluate(el => el.getAnimations().length)).toBe(0);
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    for (const button of await page.locator('header .language-control button').all()) {
      await expect(button).toBeInViewport({ ratio: 1 });
    }
    const lastWeek = page.getByRole('button', { name: '28', exact: true });
    await lastWeek.scrollIntoViewIfNeeded();
    await expect(lastWeek).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(writes).toEqual([]);
    expect(privateReads).toEqual([]);
  });
}


test('dashboard header link keeps the existing signed-out access guard', async ({ page, context }) => {
  const fixture = await installPublicBookingFixture(context);
  await page.goto('/booking?lang=sk');
  const dashboard = page.getByRole('link', { name: 'Dashboard', exact: true });
  await dashboard.focus();
  await expect(dashboard).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole('heading', { name: 'Prihlásenie', exact: true })).toBeVisible();
  expect(fixture.writes).toEqual([]);
  expect(fixture.blocked).toEqual([]);
});
