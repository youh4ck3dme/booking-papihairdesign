import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  testMatch: ['booking-light.spec.ts', 'employee-dashboard.spec.ts', 'employee-worker.spec.ts'],
  retries: 0,
  workers: 2,
  use: { ...baseConfig.use, baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173' },
});
