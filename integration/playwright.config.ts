import { defineConfig } from '@playwright/test';
import base from '../e2e/playwright.config';

for (const key of ['PAPI_ANGULAR_URL', 'PAPI_BOOKING_URL']) {
  const url = new URL(process.env[key] ?? '');
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error(`${key} must point to an isolated local preview`);
}
export default defineConfig({
  ...base, testDir: '.', testMatch: 'cross-app.spec.ts', workers: 1, retries: 0,
  projects: [base.projects![0]],
  timeout: 60_000,
  use: { ...base.use, serviceWorkers: 'block', video: 'on', trace: 'retain-on-failure' },
  outputDir: process.env.PAPI_INTEGRATION_OUTPUT ?? './results',
});
