import { defineConfig } from '@playwright/test';

const BACKOFFICE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3002';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

/** DS 07's test widths; 320 is the floor below which a page may scroll sideways. */
const DS07_WIDTHS = [320, 375, 414, 768, 1024, 1440];
const RESPONSIVE_SPEC = /responsive\.spec\.ts/;

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
  // The behaviour specs run once at Playwright's default viewport; the DS 07
  // layout spec runs once per test width.
  projects: [
    { name: 'default', testIgnore: RESPONSIVE_SPEC },
    ...DS07_WIDTHS.map((width) => ({
      name: `ds07-${width}`,
      testMatch: RESPONSIVE_SPEC,
      use: { viewport: { width, height: 900 } },
    })),
  ],
  webServer: {
    command: 'pnpm dev',
    url: `${API_URL}/health`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    // Raise the rate limits so the suite's many session checks never throttle.
    env: {
      RATE_LIMIT_MAX: '100000',
      RATE_LIMIT_AUTH_MAX: '100000',
    },
  },
});
