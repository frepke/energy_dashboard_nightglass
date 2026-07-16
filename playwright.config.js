// @ts-check
import { defineConfig, devices } from '@playwright/test';

const CHROMIUM_EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '';

export default defineConfig({
  testDir: './tests/visual',
  snapshotDir: './tests/visual/snapshots',

  // Update snapshots only when explicitly asked
  updateSnapshots: 'none',

  use: {
    // Serve the dashboard locally during tests
    baseURL: 'http://127.0.0.1:5500',

    // Keep clock/date/chart rendering stable across CI machines and laptops.
    // The committed snapshots were generated for the dashboard's default
    // Netherlands location, so the browser timezone must not depend on the host.
    timezoneId: 'Europe/Amsterdam',
    locale: 'en-GB',
    colorScheme: 'dark',
    reducedMotion: 'reduce',

    launchOptions: {
      ...(CHROMIUM_EXECUTABLE ? { executablePath: CHROMIUM_EXECUTABLE } : {}),
      args: ['--no-sandbox'],
    },
  },

  // Run a lightweight static server before the tests
  webServer: {
    command: 'npx serve . --listen 5500 --no-clipboard',
    url: 'http://127.0.0.1:5500',
    reuseExistingServer: true,
    timeout: 15_000,
  },

  projects: [
    {
      name: 'Desktop (MacBook Air)',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'iPhone 14',
      // Uses Chromium (not WebKit) so only one browser install is needed:
      //   npx playwright install chromium --with-deps
      use: { ...devices['iPhone 14'], defaultBrowserType: 'chromium' },
    },
  ],
});
