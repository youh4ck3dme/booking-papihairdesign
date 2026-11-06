import { test, expect } from '@playwright/test';
import { installPublicBookingFixture } from '../e2e/helpers/public-booking-fixture';
import { createServer } from 'node:http';

const angular = new URL(process.env.PAPI_ANGULAR_URL!).origin;
const booking = new URL(process.env.PAPI_BOOKING_URL!).origin;

for (const [width,height] of [[320,568],[390,844],[844,390],[1440,900]]) {
  test(`paired Angular and booking navigation at ${width}x${height}`, async ({ page,context }, info) => {
    await page.setViewportSize({ width,height });
    const fixture = await installPublicBookingFixture(context);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(angular+'/');
    const menu = page.getByRole('button', { name: 'Otvoriť mobilné menu', exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.locator('header a[href="/booking"]:visible').click();
    await expect(page).toHaveURL(angular+'/booking');
    await expect(page.locator('app-header, app-footer, app-booking-modal')).toHaveCount(0);
    await expect(page.locator('iframe')).toHaveCount(1);
    await expect(page.locator('iframe')).toHaveAttribute('src', booking+'/booking?lang=sk');
    const frame = page.frameLocator('app-booking iframe');
    await expect(frame.getByRole('heading', { name: 'Vyberte kategóriu', exact: true })).toBeVisible();
    const back = frame.getByRole('link', { name: 'Späť na web', exact: true });
    await expect(back).not.toHaveAttribute('target', '_blank');
    await frame.getByRole('button', { name: 'Switch to English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang','en');
    await expect(frame.locator('html')).toHaveAttribute('lang','en');
    await page.reload();
    await expect(page.locator('iframe')).toHaveCount(1);
    await expect(frame.getByRole('heading',{name:'Choose a category',exact:true})).toBeVisible();
    await page.locator('html').evaluate(element => element.style.fontSize='200%');
    await frame.locator('html').evaluate(element => element.style.fontSize='200%');
    await frame.getByRole('button', { name: 'HAIRCUT', exact: true }).click();
    await expect(frame.getByRole('button', { name: 'Choose a service', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    expect(await frame.locator('html').evaluate(element => element.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath(`paired-booking-${width}.png`)});
    const englishBack = frame.getByRole('link', { name: 'Back to website', exact: true });
    await englishBack.focus(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(angular+'/');
    await expect(page.locator('app-header')).toBeVisible();
    await expect(page.locator('app-footer')).toHaveCount(1);
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('main').first()).toBeFocused();
    await page.goBack(); await expect(page).toHaveURL(angular+'/booking');
    await expect(frame.getByRole('heading', { name: 'Choose a category',exact:true })).toBeVisible();
    await page.goForward(); await expect(page).toHaveURL(angular+'/');
    await expect(page.locator('iframe')).toHaveCount(0);

    await page.goto(booking+'/?lang=sk#services');
    await expect(page).toHaveURL(booking+'/booking?lang=sk#services');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Vyberte kategóriu',exact:true })).toBeVisible();
    await page.getByRole('link', { name: 'Dashboard',exact:true }).click();
    await expect(page).toHaveURL(booking+'/auth');
    await expect(page.getByRole('heading', { name: 'Prihlásenie',exact:true })).toBeVisible();
    await page.goBack();
    const standalone = page.getByRole('link', { name: 'Späť na web',exact:true });
    await expect(standalone).toHaveAttribute('href', angular+'/');
    expect(await standalone.getAttribute('target')).toBeNull();
    await standalone.click(); await expect(page).toHaveURL(angular+'/');
    await expect(page.locator('app-header')).toBeVisible();
    expect(fixture.writes).toEqual([]); expect(fixture.blocked).toEqual([]); expect(errors).toEqual([]);
  });
}

for (const role of ['employee','admin','owner','customer'] as const) {
  test(`embedded dashboard preserves ${role} access`, async ({page,context}) => {
    const fixture = await installPublicBookingFixture(context,[],{auth:{role,signedIn:true}});
    await page.goto(angular+'/booking');
    const frame=page.frameLocator('app-booking iframe');
    await frame.getByRole('link',{name:'Dashboard',exact:true}).click();
    await expect(page).toHaveURL(angular+'/booking');
    if(role==='customer') await expect(frame.getByRole('alert')).toContainText('nemá zamestnanecký prístup');
    else if(role==='employee') await expect(frame.getByRole('heading',{name:'Dnes',exact:true})).toBeVisible();
    else await expect(frame.getByRole('heading',{name:'Prehľad',exact:true})).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(1);
    expect(fixture.writes).toEqual([]); expect(fixture.blocked).toEqual([]);
  });
}

test('unsupported host opens the website safely in a separate tab', async ({page,context}) => {
  const fixture=await installPublicBookingFixture(context);
  // A genuine local HTTP response preserves Chrome's address-space checks.
  // Browser-intercepted synthetic documents have a different network context.
  const host=createServer((_request,response)=>{response.writeHead(200,{'Content-Type':'text/html'});response.end(`<iframe title="Legacy booking" style="width:100%;height:90vh" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" src="${booking}/booking?lang=sk"></iframe>`);});
  await new Promise<void>(resolve=>host.listen(0,'127.0.0.1',resolve));
  const address=host.address(); if(!address||typeof address==='string')throw new Error('Fixture host not listening');
  const hostUrl=`http://127.0.0.1:${address.port}/`;
  try {
  await page.goto(hostUrl);
  const link=page.frameLocator('iframe').getByRole('link',{name:'Späť na web',exact:true});
  await expect(link).toHaveAttribute('target','_blank');
  await expect(link).toHaveAttribute('rel','noopener noreferrer');
  const nextPage=context.waitForEvent('page'); await link.click();const opened=await nextPage;
  await expect(opened).toHaveURL(angular+'/');
  await expect(opened.locator('app-header')).toBeVisible();
  // Playwright tracks popup ancestry even when the browser correctly clears window.opener.
  expect(await opened.evaluate(() => window.opener === null)).toBe(true);
  await expect(page).toHaveURL(hostUrl);
  await expect(page.frameLocator('iframe').getByRole('heading',{name:'Vyberte kategóriu',exact:true})).toBeVisible();
  expect(fixture.writes).toEqual([]);expect(fixture.blocked).toEqual([]);
  } finally { host.closeAllConnections();await new Promise<void>(resolve=>host.close(()=>resolve())); }
});
