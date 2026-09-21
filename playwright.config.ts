import { defineConfig } from '@playwright/test';

const BACKOFFICE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3002';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

/**
 * End-to-end tests drive the back-office in a real browser against the running
 * stack (Docker + `pnpm dev`). The suite is serial: it shares one database and
 * one Mailpit inbox, and magic-link sign-in is single-use.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: BACKOFFICE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: `${API_URL}/health`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
