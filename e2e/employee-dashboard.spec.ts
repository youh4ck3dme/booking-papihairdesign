import { test, expect, type Page } from '@playwright/test';
import { installPublicBookingFixture } from './helpers/public-booking-fixture';
import { installEmployeeFixture, defaultAppointments, appointment, switchFixtureAccount, BUSINESS_A, EMPLOYEE_A, STAFF_A, STAFF_B, FIXED_NOW } from './helpers/employee-fixture';

test.use({ locale: 'sk-SK', timezoneId: 'America/New_York', serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => { await page.clock.install({ time: new Date(FIXED_NOW) }); });

async function expectNoOuterOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function openFirstPending(page: Page) {
  const card = page.getByTestId('appointment-40000000-0000-4000-8000-000000000001').first();
  await card.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Detail rezervácie', exact: true })).toBeVisible();
  return card;
}
for (const [width, height] of [[240, 640], [320, 568], [390, 844], [844, 390], [768, 1024], [1440, 900]]) {
  test(`employee mobile-first navigation, language and accessible detail ${width}x${height}`, async ({ page, context }, testInfo) => {
    const fixture = await installEmployeeFixture(context);
    const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Dnes', exact: true })).toBeVisible();
    await expect(page.getByText('Anna Pending', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('COLLEAGUE PRIVATE')).toHaveCount(0);
    await expect(page.getByText('OTHER BUSINESS PRIVATE')).toHaveCount(0);
    await expect(page.getByTestId('appointment-40000000-0000-4000-8000-000000000001').first()).toContainText('11:00');
    if ([390, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`employee-today-${width}.png`), fullPage: true });
    expect(fixture.queries.length).toBeGreaterThan(0);
    for (const url of fixture.queries) {
      expect(url.searchParams.get('business_id')).toBe(`eq.${BUSINESS_A}`);
      expect(url.searchParams.get('employee_id')).toBe(`eq.${EMPLOYEE_A}`);
    }
    const trigger = await openFirstPending(page);
    const detail = page.getByRole('dialog', { name: 'Detail rezervácie', exact: true });
    const focusableCount = await detail.locator('a[href], button:not([disabled]), input, select, textarea, [tabindex="0"]').count();
    for (let index = 0; index <= focusableCount; index++) {
      await page.keyboard.press('Tab');
      expect(await detail.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await detail.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    const navigation = page.getByRole('navigation', { name: 'Zamestnanecká navigácia' }).filter({ visible: true });
    const calendar = navigation.getByRole('link', { name: 'Kalendár', exact: true });
    const navBox = (await calendar.boundingBox())!;
    expect(navBox.height).toBeGreaterThanOrEqual(44); expect(navBox.width).toBeGreaterThanOrEqual(44);
    await calendar.click();
    await expect(page).toHaveURL(/\/admin\/my/);
    await expect(page.getByRole('heading', { name: 'Môj kalendár', exact: true })).toBeVisible();
    if ([390, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`employee-calendar-${width}.png`), fullPage: true });
    await page.reload(); await expect(page.getByRole('heading', { name: 'Môj kalendár', exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Zamestnanecká navigácia' }).filter({ visible: true }).getByRole('link', { name: 'Rezervácie', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Rezervácie', exact: true })).toBeVisible();
    if ([390, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`employee-appointments-${width}.png`), fullPage: true });
    await page.goBack(); await expect(page.getByRole('heading', { name: 'Môj kalendár', exact: true })).toBeVisible();
    await page.goForward(); await expect(page.getByRole('heading', { name: 'Rezervácie', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Appointments', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Prepnúť do slovenčiny', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await expectNoOuterOverflow(page);
    const finalCard = page.locator('[data-testid^="appointment-"]').last();
    await finalCard.scrollIntoViewIfNeeded();
    await expect(finalCard).toBeInViewport();
    // A fixed bottom navigation is not accounted for by CDP's centered
    // scrollIntoViewIfNeeded. Exercise the user's actual end-of-page scroll.
    await finalCard.focus();
    await page.keyboard.press('End');
    await expect.poll(() => page.evaluate(() => { const root = document.scrollingElement!; return Math.ceil(root.scrollTop + root.clientHeight) >= root.scrollHeight; })).toBe(true);
    const lastBox = (await finalCard.boundingBox())!;
    if (width < 768) {
      const bottomNav = page.getByRole('navigation', { name: 'Zamestnanecká navigácia' }).filter({ visible: true });
      expect(lastBox.y + lastBox.height).toBeLessThanOrEqual((await bottomNav.boundingBox())!.y + 1);
    }
    await page.getByRole('navigation', { name: 'Zamestnanecká navigácia' }).filter({ visible: true }).getByRole('link', { name: 'Kalendár', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Môj kalendár', exact: true })).toBeVisible();
    await expectNoOuterOverflow(page);
    await page.getByRole('navigation', { name: 'Zamestnanecká navigácia' }).filter({ visible: true }).getByRole('link', { name: 'Dnes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dnes', exact: true })).toBeVisible();
    await expectNoOuterOverflow(page);
    expect(fixture.writes).toEqual([]); expect(fixture.blocked).toEqual([]); expect(pageErrors).toEqual([]);
  });
}

test('employee confirms, completes and cancels only own current-status reservations', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context);
  await page.goto('/admin');
  await openFirstPending(page);
  await page.getByRole('button', { name: 'Potvrdiť', exact: true }).click();
  await expect.poll(() => fixture.rows[0].status).toBe('confirmed');
  await openFirstPending(page);
  await page.getByRole('button', { name: 'Dokončiť', exact: true }).click();
  await expect.poll(() => fixture.rows[0].status).toBe('completed');
  await page.getByTestId('appointment-40000000-0000-4000-8000-000000000002').first().click();
  await page.getByRole('button', { name: 'Zrušiť rezerváciu', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Zrušiť túto rezerváciu?' })).toBeVisible();
  await page.getByRole('button', { name: 'Ponechať rezerváciu', exact: true }).click();
  expect(fixture.rows[1].status).toBe('confirmed');
  await page.getByRole('button', { name: 'Zrušiť rezerváciu', exact: true }).click();
  await page.getByRole('button', { name: 'Áno, zrušiť', exact: true }).click();
  await expect.poll(() => fixture.rows[1].status).toBe('cancelled');
  expect(fixture.writes.map(write => write.body)).toEqual([{ status: 'confirmed' }, { status: 'completed' }, { status: 'cancelled' }]);
  for (const write of fixture.writes) {
    expect(write.principal).toBe(STAFF_A);
    expect(write.url.searchParams.get('business_id')).toBe(`eq.${BUSINESS_A}`);
    expect(write.url.searchParams.get('employee_id')).toBe(`eq.${EMPLOYEE_A}`);
    expect(write.url.searchParams.get('status')).toMatch(/^eq\.(pending|confirmed)$/);
    expect(write.url.searchParams.get('id')).toMatch(/^eq\./);
  }
  await page.getByTestId('appointment-40000000-0000-4000-8000-000000000001').first().click();
  await expect(page.getByRole('button', { name: 'Potvrdiť', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dokončiť', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Zrušiť rezerváciu', exact: true })).toHaveCount(0);
  expect(fixture.blocked).toEqual([]);
});

test('conflicting write reports failure without a false status success', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context); fixture.conflictNextWrite = true;
  await page.goto('/admin'); await openFirstPending(page);
  await page.getByRole('button', { name: 'Potvrdiť', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /zmen|aktualiz|obnov|konflikt/i }).first()).toBeVisible();
  expect(fixture.rows[0].status).toBe('pending');
  expect(fixture.writes).toHaveLength(1);
});

test('loading, failed read, retry and empty day remain distinct', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context);
  let release!: () => void; fixture.delayNextRead = new Promise<void>(resolve => { release = resolve; });
  await page.goto('/admin');
  await expect(page.getByRole('status').first()).toBeVisible();
  expect(await page.getByText('Žiadne rezervácie v tomto období.', { exact: true }).count()).toBe(0);
  release(); await expect(page.getByText('Anna Pending', { exact: true }).first()).toBeVisible();
  fixture.error = true;
  await page.getByRole('button', { name: 'Obnoviť rezervácie', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rezervácie sa nepodarilo načítať', exact: true })).toBeVisible();
  fixture.error = false; fixture.rows = [];
  await page.getByRole('button', { name: 'Skúsiť znova', exact: true }).click();
  await expect(page.getByText('Žiadne rezervácie v tomto období.', { exact: true })).toBeVisible();
  expect(fixture.blocked).toEqual([]);
});

test('missing employee mapping never selects the first colleague', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context, { missingEmployee: true });
  await page.goto('/admin/my');
  await expect(page.getByText('Váš účet nie je prepojený so zamestnancom.', { exact: true })).toBeVisible();
  expect(fixture.queries).toHaveLength(0);
  await expect(page.getByText('Anna Pending')).toHaveCount(0);
});

test('customer cannot open staff data', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context, { role: 'customer' });
  await page.goto('/admin/appointments');
  await expect(page.getByRole('alert')).toContainText('Tento účet nemá zamestnanecký prístup.');
  expect(fixture.queries).toHaveLength(0);
});

test('expired session cannot load reservations', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context, { expired: true });
  await page.goto('/admin'); await expect(page).toHaveURL(/\/auth/);
  expect(fixture.queries).toHaveLength(0);
});

test('employee cannot directly open privileged administrator screens', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context);
  for (const url of ['/admin/calendar', '/admin/employees', '/admin/services', '/admin/customers', '/admin/settings', '/reception']) {
    await page.goto(url); await expect(page).toHaveURL(/\/admin(?:\?|$|\/my)/);
    await expect(page.getByText('Anna Pending', { exact: true }).first()).toBeVisible();
  }
  expect(fixture.blocked).toEqual([]);
});

test('owner retains the existing administration dashboard', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context, { role: 'owner' });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Prehľad', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zamestnanci', exact: true })).toBeVisible();
  expect(fixture.blocked).toEqual([]);
});

test('new identity never receives prior employee data or its delayed response', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context);
  await page.goto('/admin'); await expect(page.getByText('Anna Pending', { exact: true }).first()).toBeVisible();
  let release!: () => void; fixture.delayNextRead = new Promise<void>(resolve => { release = resolve; });
  const originalQueries = fixture.queries.length;
  await page.getByRole('button', { name: 'Obnoviť rezervácie', exact: true }).click();
  await expect.poll(() => fixture.queries.length).toBeGreaterThan(originalQueries);
  await switchFixtureAccount(page, STAFF_B);
  await expect(page.getByText('COLLEAGUE PRIVATE', { exact: true }).first()).toBeVisible();
  release();
  await expect(page.getByText('Anna Pending', { exact: true })).toHaveCount(0);
  await expect(page.getByText('OTHER BUSINESS PRIVATE', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Môj profil', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Odhlásiť sa', exact: true }).click();
  await expect(page).toHaveURL(/\/auth/);
  fixture.offline = true; await page.goBack();
  await expect(page.getByText('COLLEAGUE PRIVATE', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Anna Pending', { exact: true })).toHaveCount(0);
  expect(fixture.blocked).toEqual([]);
});

test('reservation search, status filter and pagination operate on scoped records', async ({ page, context }) => {
  const rows = defaultAppointments();
  for (let index = 0; index < 28; index++) rows.push(appointment(`50000000-0000-4000-8000-${String(index).padStart(12, '0')}`, `Future client ${index}`, 'confirmed', `2026-11-${String(7 + Math.floor(index / 2)).padStart(2, '0')}T10:00:00Z`));
  const fixture = await installEmployeeFixture(context, { rows });
  await page.goto('/admin/appointments');
  await expect(page.getByRole('button', { name: 'Ďalšia strana', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Ďalšia strana', exact: true }).click();
  await expect(page.getByText('Future client 27', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Hľadať rezerváciu', exact: true }).fill('Future client 27');
  await expect(page.locator('[data-testid^="appointment-"]')).toHaveCount(1);
  await expect(page.getByText('Future client 27', { exact: true })).toBeVisible();
  expect(fixture.blocked).toEqual([]);
});

test('offline dashboard hides personal rows and provides a recoverable connection state', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context);
  await page.goto('/admin'); await expect(page.getByText('Anna Pending', { exact: true }).first()).toBeVisible();
  fixture.offline = true; await context.setOffline(true);
  await expect(page.getByText('Ste offline. Osobné rezervácie sa neukladajú do zariadenia.', { exact: true })).toBeVisible();
  await expect(page.getByText('Anna Pending', { exact: true })).toHaveCount(0);
  fixture.offline = false; await context.setOffline(false);
  await page.getByRole('button', { name: 'Obnoviť rezervácie', exact: true }).click();
  await expect(page.getByText('Anna Pending', { exact: true }).first()).toBeVisible();
});

test('signed-out direct navigation requires authentication without data requests', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context, { signedIn: false });
  await page.goto('/admin/my'); await expect(page).toHaveURL(/\/auth/);
  expect(fixture.queries).toHaveLength(0);
});

test('history and state filter exclude other periods and states', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context);
  await page.goto('/admin/appointments');
  await page.getByRole('button', { name: 'História', exact: true }).click();
  await expect(page.getByText('Mária Completed', { exact: true })).toBeVisible();
  await expect(page.getByText('Zora Cancelled', { exact: true })).toBeVisible();
  await expect(page.getByText('Anna Pending', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Stav rezervácie', exact: true }).selectOption('completed');
  await expect(page.getByText('Mária Completed', { exact: true })).toBeVisible();
  await expect(page.getByText('Zora Cancelled', { exact: true })).toHaveCount(0);
  expect(fixture.queries.at(-1)?.searchParams.get('status')).toBe('eq.completed');
});

test('missing membership denies access without a demo business lookup', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context, { missingMembership: true });
  await page.goto('/admin');
  await expect(page.getByRole('alert')).toContainText('Tento účet nemá zamestnanecký prístup.');
  expect(fixture.queries).toHaveLength(0);
});

test('pending mutation disables repeated actions until the server responds', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context);
  let release!: () => void; fixture.delayNextWrite = new Promise<void>(resolve => { release = resolve; });
  await page.goto('/admin'); await openFirstPending(page);
  await page.getByRole('button', { name: 'Potvrdiť', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ukladám…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Zrušiť rezerváciu', exact: true })).toBeDisabled();
  expect(fixture.writes).toHaveLength(1);
  release();
  await expect.poll(() => fixture.rows[0].status).toBe('confirmed');
});

test('ambiguous active employee mapping is rejected instead of choosing a record', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context, { ambiguousEmployee: true });
  await page.goto('/admin');
  await expect(page.getByText('Váš účet nie je prepojený so zamestnancom.', { exact: true })).toBeVisible();
  expect(fixture.queries).toHaveLength(0);
});

test('public booking validates contact data and consent without creating a reservation', async ({ page, context }) => {
  const fixture = await installPublicBookingFixture(context);
  await page.goto('/booking');
  await page.getByRole('button', { name: 'STRIH', exact: true }).click();
  await page.getByRole('radio', { name: 'Dámske strihy', exact: true }).focus(); await page.keyboard.press('Space');
  await page.getByRole('radio', { name: 'Test Stylist', exact: true }).focus(); await page.keyboard.press('Space');
  await page.getByRole('button', { name: '7', exact: true }).click();
  await page.getByRole('button', { name: '10:00', exact: true }).click();
  const submit = page.getByRole('button', { name: 'REZERVOVAŤ ONLINE', exact: true });
  await submit.click();
  await expect(page.getByText('Meno musí mať aspoň 2 znaky', { exact: true })).toBeVisible();
  await expect(page.getByText('Priezvisko musí mať aspoň 2 znaky', { exact: true })).toBeVisible();
  await expect(page.getByText('Neplatný email', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Meno', { exact: true }).fill('Test');
  await page.getByPlaceholder('Priezvisko', { exact: true }).fill('Fixture');
  await page.getByPlaceholder('Email', { exact: true }).fill('invalid');
  await submit.click();
  await expect(page.getByText('Neplatný email', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Email', { exact: true }).fill('fixture@example.invalid');
  await submit.click();
  await expect(page.getByText('Musíte súhlasiť s obchodnými podmienkami', { exact: true })).toBeVisible();
  expect(fixture.blocked).toEqual([]); expect(fixture.writes).toEqual([]);
});

test('login form validation remains functional after dependency updates', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context, { signedIn: false });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Prihlásiť sa', exact: true }).click();
  await expect(page.getByText('Neplatný email', { exact: true })).toBeVisible();
  await expect(page.getByText('Heslo musí mať aspoň 6 znakov', { exact: true })).toBeVisible();
  expect(fixture.blocked).toEqual([]); expect(errors).toEqual([]);
});

test('calendar date changes use salon midnight independently of browser timezone', async ({ page, context }) => {
  const fixture = await installEmployeeFixture(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/my');
  await expect(page.getByText('Anna Pending', { exact: true })).toBeVisible();
  expect(fixture.queries.at(-1)?.searchParams.get('end_at')).toBe('gt.2026-11-05T23:00:00.000Z');
  expect(fixture.queries.at(-1)?.searchParams.get('start_at')).toBe('lt.2026-11-06T23:00:00.000Z');
  await page.getByLabel('Vybrať dátum', { exact: true }).fill('2026-11-07');
  await expect(page.getByText('Žiadne rezervácie v tomto období.', { exact: true })).toBeVisible();
  await expect(page.getByText('Anna Pending', { exact: true })).toHaveCount(0);
  expect(fixture.queries.at(-1)?.searchParams.get('end_at')).toBe('gt.2026-11-06T23:00:00.000Z');
  expect(fixture.queries.at(-1)?.searchParams.get('start_at')).toBe('lt.2026-11-07T23:00:00.000Z');
  await page.getByLabel('Vybrať dátum', { exact: true }).fill('2026-11-06');
  await expect(page.getByLabel('Vybrať dátum', { exact: true })).toHaveValue('2026-11-06');
  // Returning to a still-fresh day may use the correctly scoped query cache.
  await expect(page.getByText('Anna Pending', { exact: true })).toBeVisible();
  await expect(page.getByText('Žiadne rezervácie v tomto období.', { exact: true })).toHaveCount(0);
});


test('public availability uses timestamp-only RPC and excludes the occupied time', async ({ page, context }) => {
  expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('America/New_York');
  const busy = { start_at: '2026-11-07T09:00:00.000Z', end_at: '2026-11-07T09:45:00.000Z' }; // 10:00–10:45 in Bratislava, independent of the browser.
  const fixture = await installPublicBookingFixture(context, [busy]);
  await page.goto('/booking');
  await page.getByRole('button', { name: 'STRIH', exact: true }).click();
  await page.getByRole('radio', { name: 'Dámske strihy', exact: true }).focus(); await page.keyboard.press('Space');
  await page.getByRole('radio', { name: 'Test Stylist', exact: true }).focus(); await page.keyboard.press('Space');
  await page.getByRole('button', { name: '7', exact: true }).click();
  await expect(page.getByRole('button', { name: '10:45', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '10:00', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '10:15', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '10:30', exact: true })).toHaveCount(0);
  expect(fixture.busyRequests).toHaveLength(1);
  expect(fixture.busyRequests[0]._employee_id).toBe(EMPLOYEE_A);
  expect(fixture.busyRequests[0]._start).toBe('2026-11-06T23:00:00.000Z');
  expect(fixture.busyRequests[0]._end).toBe('2026-11-07T23:00:00.000Z');
  expect(fixture.blocked).toEqual([]); expect(fixture.writes).toEqual([]);
});


test('public availability RPC failure offers no times and recovers through an explicit retry', async ({ page, context }) => {
  const fixture = await installPublicBookingFixture(context, [{ start_at: '2026-11-07T09:00:00.000Z', end_at: '2026-11-07T09:45:00.000Z' }]);
  fixture.busyError = true;
  await page.goto('/booking');
  await page.getByRole('button', { name: 'STRIH', exact: true }).click();
  await page.getByRole('radio', { name: 'Dámske strihy', exact: true }).focus(); await page.keyboard.press('Space');
  await page.getByRole('radio', { name: 'Test Stylist', exact: true }).focus(); await page.keyboard.press('Space');
  await page.getByRole('button', { name: '7', exact: true }).click();
  const availabilityError = page.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Skúsiť znova', exact: true }) });
  await expect(availabilityError).toContainText('Chyba pri komunikácii so serverom');
  await expect(page.getByRole('button', { name: /^\d{2}:\d{2}$/ })).toHaveCount(0);
  await expect(page.getByText('Žiadne dostupné termíny v tento deň', { exact: true })).toHaveCount(0);
  expect(fixture.busyRequests).toHaveLength(1);
  fixture.busyError = false;
  await page.getByRole('button', { name: 'Skúsiť znova', exact: true }).click();
  await expect(page.getByRole('button', { name: '10:45', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '10:00', exact: true })).toHaveCount(0);
  await expect(availabilityError).toHaveCount(0);
  expect(fixture.busyRequests).toHaveLength(2);
  expect(fixture.blocked).toEqual([]); expect(fixture.writes).toEqual([]);
});


test('valid public submit uses one simulated booking RPC with salon UTC time and no Edge request', async ({ page, context }) => {
  expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('America/New_York');
  const fixture = await installPublicBookingFixture(context, [{ start_at: '2026-11-07T09:00:00.000Z', end_at: '2026-11-07T09:45:00.000Z' }], { simulateCreate: true });
  await page.goto('/booking');
  await page.getByRole('button', { name: 'STRIH', exact: true }).click();
  await page.getByRole('radio', { name: 'Dámske strihy', exact: true }).focus(); await page.keyboard.press('Space');
  await page.getByRole('radio', { name: 'Test Stylist', exact: true }).focus(); await page.keyboard.press('Space');
  await page.getByRole('button', { name: '7', exact: true }).click();
  await page.getByRole('button', { name: '10:45', exact: true }).click();
  await page.getByPlaceholder('Meno', { exact: true }).fill('Test');
  await page.getByPlaceholder('Priezvisko', { exact: true }).fill('Fixture');
  await page.getByPlaceholder('Email', { exact: true }).fill('fixture@example.invalid');
  await page.getByText('všeobecnými obchodnými podmienkami', { exact: true }).click();
  await page.getByRole('button', { name: 'REZERVOVAŤ ONLINE', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rezervácia potvrdená!', exact: true })).toBeVisible();
  await expect(page.getByText('10:45', { exact: true })).toBeVisible();
  expect(fixture.employeeRequests.some(request => request._service_id === null)).toBe(true);
  expect(fixture.employeeRequests.some(request => request._service_id === 'service-1')).toBe(true);
  expect(fixture.simulatedCreates).toEqual([{ business_id: 'a1b2c3d4-0000-0000-0000-000000000001', service_id: 'service-1', employee_id: EMPLOYEE_A, start_at: '2026-11-07T09:45:00.000Z', customer_name: 'Test Fixture', customer_email: 'fixture@example.invalid' }]);
  expect(fixture.blocked).toEqual([]); // Includes any attempted Edge fallback or unallowlisted mutation.
  expect(fixture.writes).toEqual([]);
});
