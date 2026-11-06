import { test, expect } from '@playwright/test';

test.use({ locale: 'sk-SK', serviceWorkers: 'block' });
for (const [width, height] of [[320,568],[390,844],[844,390],[768,1024],[1440,900]]) {
  test(`light booking language and offer reveal at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const writes: string[] = [];
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['127.0.0.1','localhost'].includes(url.hostname)) return route.continue();
      if (url.hostname.includes('supabase') || url.hostname === 'booking-fixture.invalid') {
        if (route.request().method() !== 'GET') {
          writes.push(route.request().method() + ' ' + url.pathname);
          return route.fulfill({ status: 405, body: '{}' });
        }
        const table = url.pathname.split('/').pop();
        const rows: Record<string, unknown> = {
          businesses: [{ id: 'a1b2c3d4-0000-0000-0000-000000000001', name: 'Fixture salon' }],
          services: [{ id: 'service-1', name_sk: 'Dámske strihy', category: 'damske', subcategory: 'STRIH', price: 30, duration_minutes: 45, buffer_minutes: 0, is_active: true }],
          employees: [{ id: 'c1000000-0000-0000-0000-000000000001', display_name: 'Test Stylist', is_active: true, profile_id: null }],
        };
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows[table ?? ''] ?? []) });
      }
      return route.abort();
    });
    await page.goto('/booking?lang=sk');
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
    expect(logoBox.width).toBeGreaterThanOrEqual(140);
    expect(Math.abs(logoBox.width / logoBox.height - 359 / 142)).toBeLessThan(0.01);
    await expect(page.locator('html')).not.toHaveClass(/dark/);
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
    for (const offer of await page.locator('.booking-offer').all()) {
      await expect(offer).toHaveCSS('transform', 'none');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Vyberte pracovníka', exact: true }).click();
    expect(await page.locator('[aria-label="Ponuka pracovníkov"]').evaluate(el => el.getAnimations().length)).toBe(0);
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const lastWeek = page.getByRole('button', { name: '28', exact: true });
    await lastWeek.scrollIntoViewIfNeeded();
    await expect(lastWeek).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(writes).toEqual([]);
  });
}
